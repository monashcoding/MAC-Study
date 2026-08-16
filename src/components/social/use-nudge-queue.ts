"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getNudgeDeliveryMessage,
  sendRemoteNudge,
} from "@/lib/supabase/app-data";

const DEFAULT_NUDGE_LIMIT = 1;
const NUDGE_WINDOW_MS = 60_000;

type NudgeTarget = {
  groupId?: string | null;
  key: string;
  maxPerMinute?: number;
  recipientId: string;
};

type TargetQueueState = {
  atLimit: boolean;
  burstCount: number;
  feedback: string | null;
  pending: number;
};

const emptyQueueState: TargetQueueState = {
  atLimit: false,
  burstCount: 0,
  feedback: null,
  pending: 0,
};

export function useNudgeQueue(enabled: boolean) {
  const queuesRef = useRef<Record<string, Promise<void>>>({});
  const recentTapsRef = useRef<Record<string, number[]>>({});
  const expiryTimersRef = useRef<number[]>([]);
  const [targetStates, setTargetStates] = useState<
    Record<string, TargetQueueState>
  >({});

  useEffect(() => {
    return () => {
      expiryTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  const enqueue = useCallback(
    (target: NudgeTarget) => {
      if (!enabled) {
        setTargetStates((current) => ({
          ...current,
          [target.key]: {
            atLimit: false,
            burstCount: 0,
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
      const limit = target.maxPerMinute ?? DEFAULT_NUDGE_LIMIT;

      if (recentTaps.length >= limit) {
        const retrySeconds = Math.max(
          1,
          Math.ceil((NUDGE_WINDOW_MS - (now - recentTaps[0])) / 1000),
        );

        recentTapsRef.current[target.key] = recentTaps;
        setTargetStates((current) => ({
          ...current,
          [target.key]: {
            atLimit: true,
            burstCount: recentTaps.length,
            feedback: `Ready again in ${retrySeconds}s.`,
            pending: current[target.key]?.pending ?? 0,
          },
        }));
        return;
      }

      recentTapsRef.current[target.key] = [...recentTaps, now];
      setTargetStates((current) => {
        const pending = (current[target.key]?.pending ?? 0) + 1;
        const burstCount = recentTaps.length + 1;

        return {
          ...current,
          [target.key]: {
            atLimit: burstCount >= limit,
            burstCount,
            feedback: "Sending nudge...",
            pending,
          },
        };
      });
      const expiryTimer = window.setTimeout(() => {
        expiryTimersRef.current = expiryTimersRef.current.filter(
          (timer) => timer !== expiryTimer,
        );
        const currentTime = Date.now();
        const nextRecent = (recentTapsRef.current[target.key] ?? []).filter(
          (timestamp) => currentTime - timestamp < NUDGE_WINDOW_MS,
        );
        recentTapsRef.current[target.key] = nextRecent;
        setTargetStates((current) => {
          const previous = current[target.key] ?? emptyQueueState;

          return {
            ...current,
            [target.key]: {
              ...previous,
              atLimit: nextRecent.length >= limit,
              burstCount: nextRecent.length,
            },
          };
        });
      }, NUDGE_WINDOW_MS + 25);
      expiryTimersRef.current.push(expiryTimer);

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
              ...current[target.key],
              atLimit:
                (current[target.key]?.burstCount ?? 0) >= limit,
              burstCount: current[target.key]?.burstCount ?? 0,
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
