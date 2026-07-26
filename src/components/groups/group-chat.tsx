"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ArrowLeft, MessageCircle, Send } from "lucide-react";
import type { SocialFriend } from "@/lib/social-state";
import {
  fetchRemoteGroupChatMessages,
  sendRemoteGroupChatMessage,
  subscribeToRemoteGroupChat,
  type RemoteGroupChatMessage,
} from "@/lib/supabase/app-data";
import { cn } from "@/lib/utils";

const LOCAL_CHAT_KEY = "mac-study-group-chat";
const remoteMessageCache = new Map<string, RemoteGroupChatMessage[]>();
const remoteMessageRequests = new Map<
  string,
  Promise<RemoteGroupChatMessage[]>
>();

export function prefetchRemoteGroupChat(
  remoteClient: SupabaseClient,
  groupId: string,
) {
  return requestRemoteMessages(remoteClient, groupId, true);
}

export function GroupChat({
  currentUserId,
  groupId,
  groupName,
  members,
  onBack,
  remoteClient,
}: {
  currentUserId: string | null;
  groupId: string;
  groupName: string;
  members: SocialFriend[];
  onBack: () => void;
  remoteClient: SupabaseClient | null;
}) {
  const [messages, setMessages] = useState<RemoteGroupChatMessage[]>(() =>
    remoteClient
      ? (remoteMessageCache.get(groupId) ?? [])
      : readLocalMessages(groupId),
  );
  const [isReady, setIsReady] = useState(
    () => !remoteClient || remoteMessageCache.has(groupId),
  );
  const [isClosing, setIsClosing] = useState(false);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const chatRef = useRef<HTMLElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const hasPositionedMessagesRef = useRef(false);
  const messageListRef = useRef<HTMLDivElement>(null);
  const selfId = currentUserId ?? "you";
  const memberById = new Map(members.map((member) => [member.id, member]));

  const refresh = useCallback(async () => {
    if (!remoteClient) return;

    try {
      const nextMessages = await requestRemoteMessages(remoteClient, groupId);
      setMessages((current) => mergeMessages(current, nextMessages));
      setFeedback(null);
    } catch {
      setFeedback("Chat could not be loaded.");
    }
  }, [groupId, remoteClient]);

  useEffect(() => {
    if (!remoteClient) return;

    let cancelled = false;
    void requestRemoteMessages(remoteClient, groupId)
      .then((nextMessages) => {
        if (!cancelled) {
          setMessages((current) => mergeMessages(current, nextMessages));
          setIsReady(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFeedback("Chat could not be loaded.");
          setIsReady(true);
        }
      });

    const unsubscribe = subscribeToRemoteGroupChat(
      remoteClient,
      groupId,
      (message) => {
        if (!cancelled) {
          setMessages((current) => {
            const nextMessages = mergeMessages(current, [message]);
            remoteMessageCache.set(groupId, nextMessages);
            return nextMessages;
          });
          setIsReady(true);
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

  useLayoutEffect(() => {
    if (!isReady) return;

    const messageList = messageListRef.current;
    if (!messageList) return;

    const isInitialPosition = !hasPositionedMessagesRef.current;
    hasPositionedMessagesRef.current = true;
    messageList.scrollTo({
      behavior: isInitialPosition ? "auto" : "smooth",
      top: messageList.scrollHeight,
    });
  }, [isReady, messages]);

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
        chat.style.top = `${visualViewport?.offsetTop ?? 0}px`;
        chat.style.height = `${viewportHeight}px`;
      });
    }

    body.classList.add("mac-chat-view-active");
    sizeChat();
    window.addEventListener("resize", sizeChat);
    visualViewport?.addEventListener("resize", sizeChat);
    visualViewport?.addEventListener("scroll", sizeChat);

    return () => {
      window.cancelAnimationFrame(frame);
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
      chatRef.current?.style.removeProperty("top");
      chatRef.current?.style.removeProperty("height");
      body.classList.remove("mac-chat-view-active", "mac-chat-composer-active");
      window.removeEventListener("resize", sizeChat);
      visualViewport?.removeEventListener("resize", sizeChat);
      visualViewport?.removeEventListener("scroll", sizeChat);
    };
  }, []);

  useEffect(() => {
    const composer = composerRef.current;
    if (!composer) return;

    composer.style.height = "auto";
    composer.style.height = `${Math.min(composer.scrollHeight, 112)}px`;
  }, [draft]);

  function setComposerFocused(focused: boolean) {
    document.body.classList.toggle("mac-chat-composer-active", focused);
    window.dispatchEvent(new Event("resize"));
  }

  function closeChat() {
    if (isClosing) return;

    setIsClosing(true);
    closeTimerRef.current = window.setTimeout(onBack, 160);
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
      className={cn(
        "fixed inset-x-0 top-0 z-50 flex h-[var(--app-viewport-height)] flex-col overflow-hidden bg-[var(--color-background)] lg:relative lg:inset-auto lg:z-auto lg:h-[calc(100dvh-11rem)] lg:min-h-[32rem] lg:max-h-[760px] lg:rounded-lg lg:border lg:border-[var(--color-border)]",
        isClosing ? "mac-chat-screen-exit" : "mac-chat-screen-enter",
      )}
      ref={chatRef}
    >
      <header className="shrink-0 border-b border-[var(--color-border)] bg-[rgb(23_23_23/0.96)] px-3 pb-2 pt-[calc(var(--safe-area-top)+0.5rem)] backdrop-blur-xl lg:pt-2">
        <div className="grid grid-cols-[2.5rem_minmax(0,1fr)_2.5rem] items-center">
          <button
            aria-label="Back to group"
            className="mac-focus inline-flex h-10 w-10 items-center justify-center rounded-xl text-[var(--color-text-muted)] transition hover:bg-[rgb(255_255_255/0.045)] hover:text-[var(--color-text)]"
            onClick={closeChat}
            type="button"
          >
            <ArrowLeft aria-hidden size={19} />
          </button>
          <div className="min-w-0 text-center">
            <h2 className="truncate text-sm font-semibold">{groupName}</h2>
            <p className="mt-0.5 text-[10px] font-medium text-[var(--color-text-muted)]">
              {members.length} {members.length === 1 ? "member" : "members"}
            </p>
          </div>
          <span aria-hidden />
        </div>
      </header>

      <div className="flex h-full min-h-0 flex-col">
        <div
          className={cn(
            "min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain px-3 py-2.5 transition-opacity duration-150 sm:px-4",
            isReady ? "opacity-100" : "opacity-0",
          )}
          ref={messageListRef}
        >
          {messages.length ? (
            messages.map((message, index) => {
              const isOwn = message.userId === selfId;
              const sender = memberById.get(message.userId);
              const previousMessage = messages[index - 1];
              const startsSenderGroup =
                !previousMessage ||
                previousMessage.userId !== message.userId ||
                new Date(message.createdAt).getTime() -
                  new Date(previousMessage.createdAt).getTime() >
                  5 * 60 * 1000;

              return (
                <div
                  className={cn(
                    "flex",
                    isOwn ? "justify-end" : "justify-start",
                    startsSenderGroup && index > 0 && "pt-2",
                  )}
                  key={message.id}
                >
                  <div
                    className={cn(
                      "w-fit max-w-[92%] rounded-2xl px-3 py-1.5 sm:max-w-[82%]",
                      isOwn
                        ? "bg-[var(--color-mac-yellow)] text-[#141414]"
                        : "border border-[rgb(255_255_255/0.055)] bg-[var(--color-surface-raised)] text-[var(--color-text)]",
                    )}
                  >
                    {!isOwn && startsSenderGroup ? (
                      <p className="mb-0.5 text-[10px] font-semibold text-[var(--color-text-muted)]">
                        {sender?.handle ?? "@member"}
                      </p>
                    ) : null}
                    <p className="whitespace-pre-wrap break-words text-sm leading-snug">
                      {message.body}
                    </p>
                    <p
                      className={cn(
                        "mt-0.5 text-right text-[9px]",
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
          className="shrink-0 border-t border-[var(--color-border)] bg-[rgb(23_23_23/0.97)] px-2.5 pb-[max(0.625rem,var(--safe-area-bottom))] pt-2.5 backdrop-blur-xl"
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
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
            <textarea
              aria-label="Message"
              className="mac-focus min-h-11 min-w-0 resize-none overflow-y-auto rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-[0.68rem] text-sm leading-snug text-[var(--color-text)]"
              maxLength={2000}
              onBlur={() => setComposerFocused(false)}
              onChange={(event) => setDraft(event.target.value)}
              onFocus={() => setComposerFocused(true)}
              placeholder="Message the group…"
              ref={composerRef}
              rows={1}
              value={draft}
            />
            <button
              aria-label="Send message"
              className="mac-focus inline-flex h-11 w-11 items-center justify-center rounded-full bg-[var(--color-mac-yellow)] text-[#141414] transition active:scale-[0.97] disabled:opacity-45"
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

async function fetchAndCacheRemoteMessages(
  remoteClient: SupabaseClient,
  groupId: string,
) {
  const messages = mergeMessages(
    remoteMessageCache.get(groupId) ?? [],
    await fetchRemoteGroupChatMessages(remoteClient, groupId),
  );
  remoteMessageCache.set(groupId, messages);
  return messages;
}

function requestRemoteMessages(
  remoteClient: SupabaseClient,
  groupId: string,
  allowCached = false,
) {
  const cached = remoteMessageCache.get(groupId);
  if (allowCached && cached) return Promise.resolve(cached);

  const pending = remoteMessageRequests.get(groupId);
  if (pending) return pending;

  const request = fetchAndCacheRemoteMessages(remoteClient, groupId).finally(
    () => remoteMessageRequests.delete(groupId),
  );
  remoteMessageRequests.set(groupId, request);
  return request;
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
