"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MessageCircle, Send } from "lucide-react";
import type { SocialFriend } from "@/lib/social-state";
import {
  fetchRemoteGroupChatMessages,
  sendRemoteGroupChatMessage,
  subscribeToRemoteGroupChat,
  type RemoteGroupChatMessage,
} from "@/lib/supabase/app-data";
import { cn } from "@/lib/utils";

const LOCAL_CHAT_KEY = "mac-study-group-chat";

export function GroupChat({
  currentUserId,
  groupId,
  members,
  remoteClient,
}: {
  currentUserId: string | null;
  groupId: string;
  members: SocialFriend[];
  remoteClient: SupabaseClient | null;
}) {
  const [messages, setMessages] = useState<RemoteGroupChatMessage[]>(() =>
    remoteClient ? [] : readLocalMessages(groupId),
  );
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const chatRef = useRef<HTMLElement>(null);
  const messageListRef = useRef<HTMLDivElement>(null);
  const composerFocusedRef = useRef(false);
  const selfId = currentUserId ?? "you";
  const memberById = new Map(members.map((member) => [member.id, member]));

  const refresh = useCallback(async () => {
    if (!remoteClient) return;

    try {
      const nextMessages = await fetchRemoteGroupChatMessages(
        remoteClient,
        groupId,
      );
      setMessages((current) => mergeMessages(current, nextMessages));
      setFeedback(null);
    } catch {
      setFeedback("Chat could not be loaded.");
    }
  }, [groupId, remoteClient]);

  useEffect(() => {
    if (!remoteClient) return;

    let cancelled = false;
    void fetchRemoteGroupChatMessages(remoteClient, groupId)
      .then((nextMessages) => {
        if (!cancelled) {
          setMessages((current) => mergeMessages(current, nextMessages));
        }
      })
      .catch(() => {
        if (!cancelled) setFeedback("Chat could not be loaded.");
      });

    const unsubscribe = subscribeToRemoteGroupChat(
      remoteClient,
      groupId,
      (message) => {
        if (!cancelled) {
          setMessages((current) => mergeMessages(current, [message]));
        }
      },
    );
    const poll = window.setInterval(() => void refresh(), 5000);

    function refreshWhenVisible() {
      if (document.visibilityState === "visible") void refresh();
    }

    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      cancelled = true;
      window.clearInterval(poll);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      unsubscribe();
    };
  }, [groupId, refresh, remoteClient]);

  useEffect(() => {
    const messageList = messageListRef.current;
    if (!messageList) return;

    messageList.scrollTo({
      behavior: "smooth",
      top: messageList.scrollHeight,
    });
  }, [messages]);

  useEffect(() => {
    if (remoteClient) return;

    function syncLocalMessages(event: StorageEvent) {
      if (event.key === LOCAL_CHAT_KEY) {
        setMessages(readLocalMessages(groupId));
      }
    }

    window.addEventListener("storage", syncLocalMessages);
    return () => window.removeEventListener("storage", syncLocalMessages);
  }, [groupId, remoteClient]);

  useEffect(() => {
    const body = document.body;
    const visualViewport = window.visualViewport;
    let frame = 0;

    function sizeChat() {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const chat = chatRef.current;
        if (!chat) return;

        if (!window.matchMedia("(max-width: 1023px)").matches) {
          chat.style.removeProperty("height");
          return;
        }

        const viewportHeight = visualViewport?.height ?? window.innerHeight;
        const navHeight =
          document.querySelector<HTMLElement>(".mac-mobile-nav")
            ?.offsetHeight ?? 0;
        const bottomGap = composerFocusedRef.current ? 8 : navHeight + 12;
        const availableHeight = Math.max(
          composerFocusedRef.current ? 160 : 260,
          viewportHeight - chat.getBoundingClientRect().top - bottomGap,
        );

        chat.style.height = `${availableHeight}px`;
      });
    }

    body.classList.add("mac-chat-view-active");
    sizeChat();
    window.addEventListener("resize", sizeChat);
    visualViewport?.addEventListener("resize", sizeChat);
    visualViewport?.addEventListener("scroll", sizeChat);

    return () => {
      window.cancelAnimationFrame(frame);
      body.classList.remove("mac-chat-view-active", "mac-chat-composer-active");
      window.removeEventListener("resize", sizeChat);
      visualViewport?.removeEventListener("resize", sizeChat);
      visualViewport?.removeEventListener("scroll", sizeChat);
    };
  }, []);

  function setComposerFocused(focused: boolean) {
    composerFocusedRef.current = focused;
    document.body.classList.toggle("mac-chat-composer-active", focused);
    window.dispatchEvent(new Event("resize"));
  }

  async function sendMessage() {
    const body = draft.trim();

    if (!body || isSending) return;

    setIsSending(true);
    setFeedback(null);

    try {
      if (remoteClient) {
        await sendRemoteGroupChatMessage({
          body,
          groupId,
          supabase: remoteClient,
        });
        await refresh();
      } else {
        const nextMessages = [
          ...messages,
          {
            id: crypto.randomUUID(),
            groupId,
            userId: selfId,
            body,
            createdAt: new Date().toISOString(),
          },
        ];
        setMessages(nextMessages);
        writeLocalMessages(groupId, nextMessages);
      }

      setDraft("");
    } catch {
      setFeedback("Message could not be sent. Please try again.");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <section
      className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-[rgb(255_255_255/0.025)] lg:h-[min(52dvh,520px)]"
      ref={chatRef}
    >
      <div className="flex h-full min-h-0 flex-col">
        <div
          className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-3 sm:p-4"
          ref={messageListRef}
        >
          {messages.length ? (
            messages.map((message) => {
              const isOwn = message.userId === selfId;
              const sender = memberById.get(message.userId);

              return (
                <div
                  className={cn(
                    "flex",
                    isOwn ? "justify-end" : "justify-start",
                  )}
                  key={message.id}
                >
                  <div
                    className={cn(
                      "max-w-[84%] rounded-lg px-3 py-2",
                      isOwn
                        ? "bg-[var(--color-mac-yellow)] text-[#141414]"
                        : "bg-[var(--color-surface-raised)] text-[var(--color-text)]",
                    )}
                  >
                    {!isOwn ? (
                      <div className="mb-1">
                        <p className="text-xs font-semibold">
                          {sender?.name ?? "Group member"}
                        </p>
                        {sender?.handle ? (
                          <p className="text-[10px] text-[var(--color-text-muted)]">
                            {sender.handle}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                    <p className="whitespace-pre-wrap break-words text-sm">
                      {message.body}
                    </p>
                    <p
                      className={cn(
                        "mt-1 text-right text-[10px]",
                        isOwn
                          ? "text-black/60"
                          : "text-[var(--color-text-muted)]",
                      )}
                    >
                      {formatMessageTime(message.createdAt)}
                    </p>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="flex h-full flex-col items-center justify-center px-6 text-center text-[var(--color-text-muted)]">
              <MessageCircle aria-hidden size={30} />
              <p className="mt-3 font-semibold text-[var(--color-text)]">
                Start the conversation
              </p>
              <p className="mt-1 text-sm">
                Messages are visible to everyone in this group.
              </p>
            </div>
          )}
        </div>

        <form
          className="border-t border-[var(--color-border)] p-3"
          onSubmit={(event) => {
            event.preventDefault();
            void sendMessage();
          }}
        >
          {feedback ? (
            <p
              className="mb-2 text-xs text-[var(--color-danger)]"
              role="status"
            >
              {feedback}
            </p>
          ) : null}
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
            <input
              aria-label="Message"
              className="mac-focus h-11 min-w-0 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-text)]"
              maxLength={2000}
              onBlur={() => setComposerFocused(false)}
              onChange={(event) => setDraft(event.target.value)}
              onFocus={() => setComposerFocused(true)}
              placeholder="Message the group…"
              value={draft}
            />
            <button
              aria-label="Send message"
              className="mac-focus inline-flex h-11 w-11 items-center justify-center rounded-md bg-[var(--color-mac-yellow)] text-[#141414] disabled:opacity-45"
              disabled={!draft.trim() || isSending}
              onPointerDown={(event) => event.preventDefault()}
              type="submit"
            >
              <Send aria-hidden size={17} />
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}

function mergeMessages(
  current: RemoteGroupChatMessage[],
  incoming: RemoteGroupChatMessage[],
) {
  const byId = new Map(current.map((message) => [message.id, message]));

  incoming.forEach((message) => byId.set(message.id, message));

  return [...byId.values()].sort(
    (first, second) =>
      new Date(first.createdAt).getTime() -
      new Date(second.createdAt).getTime(),
  );
}

function formatMessageTime(value: string) {
  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? ""
    : new Intl.DateTimeFormat(undefined, {
        hour: "numeric",
        minute: "2-digit",
      }).format(date);
}

function readLocalMessages(groupId: string) {
  try {
    const value = JSON.parse(
      window.localStorage.getItem(LOCAL_CHAT_KEY) ?? "{}",
    ) as Record<string, RemoteGroupChatMessage[]>;
    return Array.isArray(value[groupId]) ? value[groupId] : [];
  } catch {
    return [];
  }
}

function writeLocalMessages(
  groupId: string,
  messages: RemoteGroupChatMessage[],
) {
  let value: Record<string, RemoteGroupChatMessage[]> = {};

  try {
    value = JSON.parse(
      window.localStorage.getItem(LOCAL_CHAT_KEY) ?? "{}",
    ) as Record<string, RemoteGroupChatMessage[]>;
  } catch {
    // Replace malformed demo data with a clean chat store.
  }

  value[groupId] = messages;
  window.localStorage.setItem(LOCAL_CHAT_KEY, JSON.stringify(value));
}
