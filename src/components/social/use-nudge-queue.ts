"use client";

import { useCallback, useRef, useState } from "react";
import {
  getNudgeDeliveryMessage,
  sendRemoteNudge,
} from "@/lib/supabase/app-data";

const NUDGE_LIMIT = 1;
const NUDGE_WINDOW_MS = 60_000;

type NudgeTarget = {
  groupId?: string | null;
  key: string;
  recipientId: string;
};

type TargetQueueState = {
  feedback: string | null;
  pending: number;
};

const emptyQueueState: TargetQueueState = {
  feedback: null,
  pending: 0,
};

export function useNudgeQueue(enabled: boolean) {
  const queuesRef = useRef<Record<string, Promise<void>>>({});
  const recentTapsRef = useRef<Record<string, number[]>>({});
  const [targetStates, setTargetStates] = useState<
    Record<string, TargetQueueState>
  >({});

  const enqueue = useCallback(
    (target: NudgeTarget) => {
      if (!enabled) {
        setTargetStates((current) => ({
          ...current,
          [target.key]: {
            feedback: "Sign in to send lock-screen nudges.",
            pending: 0,
          },
        }));
        return;
      }

      const now = Date.now();
      const recentTaps = (recentTapsRef.current[target.key] ?? []).filter(
        (timestamp) => now - timestamp < NUDGE_WINDOW_MS,
      );

      if (recentTaps.length >= NUDGE_LIMIT) {
        const retrySeconds = Math.max(
          1,
          Math.ceil((NUDGE_WINDOW_MS - (now - recentTaps[0])) / 1000),
        );

        recentTapsRef.current[target.key] = recentTaps;
        setTargetStates((current) => ({
          ...current,
          [target.key]: {
            feedback: `Ready again in ${retrySeconds}s.`,
            pending: current[target.key]?.pending ?? 0,
          },
        }));
        return;
      }

      recentTapsRef.current[target.key] = [...recentTaps, now];
      setTargetStates((current) => {
        const pending = (current[target.key]?.pending ?? 0) + 1;

        return {
          ...current,
          [target.key]: {
            feedback: "Sending nudge...",
            pending,
          },
        };
      });

      const send = async () => {
        let feedback: string;

        try {
          const delivery = await sendRemoteNudge({
            groupId: target.groupId,
            recipientId: target.recipientId,
          });
          feedback = getNudgeDeliveryMessage(delivery);
        } catch (error) {
          feedback = getNudgeErrorMessage(error);
        }

        setTargetStates((current) => {
          const pending = Math.max(0, (current[target.key]?.pending ?? 1) - 1);

          return {
            ...current,
            [target.key]: {
              feedback,
              pending,
            },
          };
        });
      };

      const currentQueue = queuesRef.current[target.key] ?? Promise.resolve();
      queuesRef.current[target.key] = currentQueue.then(send, send);
    },
    [enabled],
  );

  return {
    enqueue,
    getState(key: string) {
      return targetStates[key] ?? emptyQueueState;
    },
  };
}

function getNudgeErrorMessage(error: unknown) {
  if (error instanceof Error) {
    if (error.message.includes("send_nudge")) {
      return "Run the latest nudge migration first.";
    }

    return error.message;
  }

  return "Could not send nudge.";
}
