"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AlertCircle,
  ArrowDown,
  ArrowLeft,
  Flag,
  LoaderCircle,
  MessageCircle,
  MoreHorizontal,
  Send,
  Trash2,
} from "lucide-react";
import { AppDialog } from "@/components/app-dialog";
import { TransientToast } from "@/components/transient-toast";
import type { SocialFriend } from "@/lib/social-state";
import {
  deleteRemoteGroupChatMessage,
  fetchRemoteGroupChatMessages,
  reportRemoteGroupChatMessage,
  sendRemoteGroupChatMessage,
  subscribeToRemoteGroupChat,
  type RemoteGroupChatMessage,
  type RemoteGroupChatPage,
} from "@/lib/supabase/app-data";
import { cn } from "@/lib/utils";

const LOCAL_CHAT_KEY = "mac-study-group-chat";
type RemoteMessageCacheEntry = RemoteGroupChatPage;

const remoteMessageCache = new Map<string, RemoteMessageCacheEntry>();
const remoteMessageRequests = new Map<
  string,
  Promise<RemoteMessageCacheEntry>
>();

type PendingChatMessage = RemoteGroupChatMessage & {
  delivery: "failed" | "sending";
};

export function prefetchRemoteGroupChat(
  remoteClient: SupabaseClient,
  groupId: string,
) {
  return requestRemoteMessages(remoteClient, groupId, true);
}

export function GroupChat({
  canModerate,
  currentUserId,
  groupId,
  groupName,
  members,
  onBack,
  remoteClient,
}: {
  canModerate: boolean;
  currentUserId: string | null;
  groupId: string;
  groupName: string;
  members: SocialFriend[];
  onBack: () => void;
  remoteClient: SupabaseClient | null;
}) {
  const [messages, setMessages] = useState<RemoteGroupChatMessage[]>(() =>
    remoteClient
      ? (remoteMessageCache.get(groupId)?.messages ?? [])
      : readLocalMessages(groupId),
  );
  const [hasMore, setHasMore] = useState(
    () => remoteMessageCache.get(groupId)?.hasMore ?? false,
  );
  const [isReady, setIsReady] = useState(
    () => !remoteClient || remoteMessageCache.has(groupId),
  );
  const [isClosing, setIsClosing] = useState(false);
  const [draft, setDraft] = useState("");
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [pendingMessages, setPendingMessages] = useState<
    PendingChatMessage[]
  >([]);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [openActionId, setOpenActionId] = useState<string | null>(null);
  const [messageToDelete, setMessageToDelete] =
    useState<RemoteGroupChatMessage | null>(null);
  const chatRef = useRef<HTMLElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const hasPositionedMessagesRef = useRef(false);
  const messageListRef = useRef<HTMLDivElement>(null);
  const prependScrollHeightRef = useRef<number | null>(null);
  const shouldScrollToBottomRef = useRef(true);
  const isNearBottomRef = useRef(true);
  const messageIdsRef = useRef(new Set(messages.map((message) => message.id)));
  const selfId = currentUserId ?? "you";
  const memberById = new Map(members.map((member) => [member.id, member]));
  const displayedMessages = mergeMessages(messages, pendingMessages);

  const refresh = useCallback(async () => {
    if (!remoteClient) return;

    try {
      const nextPage = await requestRemoteMessages(remoteClient, groupId);
      const newCount = nextPage.messages.filter(
        (message) => !messageIdsRef.current.has(message.id),
      ).length;

      if (newCount) {
        if (isNearBottomRef.current) {
          shouldScrollToBottomRef.current = true;
        } else {
          setUnreadCount((current) => current + newCount);
        }
      }

      setMessages(nextPage.messages);
      setHasMore(nextPage.hasMore);
      setFeedback(null);
    } catch {
      setFeedback("Chat could not be loaded.");
    }
  }, [groupId, remoteClient]);

  useEffect(() => {
    messageIdsRef.current = new Set(messages.map((message) => message.id));
  }, [messages]);

  useEffect(() => {
    if (!remoteClient) return;

    let cancelled = false;
    void requestRemoteMessages(remoteClient, groupId)
      .then((nextPage) => {
        if (!cancelled) {
          setMessages((current) => mergeMessages(current, nextPage.messages));
          setHasMore(nextPage.hasMore);
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
          const isNew = !messageIdsRef.current.has(message.id);

          if (isNew) {
            if (isNearBottomRef.current || message.userId === selfId) {
              shouldScrollToBottomRef.current = true;
            } else {
              setUnreadCount((current) => current + 1);
            }
          }

          setMessages((current) => {
            const nextMessages = mergeMessages(current, [message]);
            const cached = remoteMessageCache.get(groupId);

            if (cached) {
              remoteMessageCache.set(groupId, {
                ...cached,
                messages: nextMessages,
              });
            }

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

    if (prependScrollHeightRef.current !== null) {
      messageList.scrollTop +=
        messageList.scrollHeight - prependScrollHeightRef.current;
      prependScrollHeightRef.current = null;
      return;
    }

    const isInitialPosition = !hasPositionedMessagesRef.current;
    hasPositionedMessagesRef.current = true;

    if (!isInitialPosition && !shouldScrollToBottomRef.current) return;

    messageList.scrollTo({
      behavior: isInitialPosition ? "auto" : "smooth",
      top: messageList.scrollHeight,
    });
    shouldScrollToBottomRef.current = false;
    isNearBottomRef.current = true;
    setUnreadCount(0);
  }, [isReady, messages, pendingMessages]);

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

  async function loadOlderMessages() {
    const oldestMessage = messages[0];
    const messageList = messageListRef.current;

    if (
      !remoteClient ||
      !oldestMessage ||
      !messageList ||
      isLoadingOlder ||
      !hasMore
    ) {
      return;
    }

    setIsLoadingOlder(true);
    setFeedback(null);

    try {
      const page = await fetchRemoteGroupChatMessages(remoteClient, groupId, {
        before: oldestMessage.createdAt,
      });
      const nextMessages = mergeMessages(page.messages, messages);

      prependScrollHeightRef.current = messageList.scrollHeight;
      remoteMessageCache.set(groupId, {
        hasMore: page.hasMore,
        messages: nextMessages,
      });
      setMessages(nextMessages);
      setHasMore(page.hasMore);
    } catch {
      setFeedback("Earlier messages could not be loaded.");
    } finally {
      setIsLoadingOlder(false);
    }
  }

  function sendMessage() {
    const body = draft.trim();

    if (!body) return;

    const pendingMessage: PendingChatMessage = {
      body,
      createdAt: new Date().toISOString(),
      delivery: "sending",
      groupId,
      id: `pending-${crypto.randomUUID()}`,
      userId: selfId,
    };

    setPendingMessages((current) => [...current, pendingMessage]);
    setDraft("");
    setFeedback(null);
    shouldScrollToBottomRef.current = true;
    void deliverPendingMessage(pendingMessage);
  }

  async function deliverPendingMessage(pendingMessage: PendingChatMessage) {
    try {
      if (remoteClient) {
        await sendRemoteGroupChatMessage({
          body: pendingMessage.body,
          groupId,
        });
        setPendingMessages((current) =>
          current.filter((message) => message.id !== pendingMessage.id),
        );
        await refresh().catch(() => undefined);
      } else {
        const deliveredMessage: RemoteGroupChatMessage = {
          body: pendingMessage.body,
          createdAt: pendingMessage.createdAt,
          groupId: pendingMessage.groupId,
          id: crypto.randomUUID(),
          userId: pendingMessage.userId,
        };
        const nextMessages = [
          ...messages,
          deliveredMessage,
        ];
        setMessages(nextMessages);
        setPendingMessages((current) =>
          current.filter((message) => message.id !== pendingMessage.id),
        );
        writeLocalMessages(groupId, nextMessages);
      }
    } catch {
      setPendingMessages((current) =>
        current.map((message) =>
          message.id === pendingMessage.id
            ? { ...message, delivery: "failed" }
            : message,
        ),
      );
    }
  }

  function retryMessage(message: PendingChatMessage) {
    setPendingMessages((current) =>
      current.map((item) =>
        item.id === message.id ? { ...item, delivery: "sending" } : item,
      ),
    );
    shouldScrollToBottomRef.current = true;
    void deliverPendingMessage({ ...message, delivery: "sending" });
  }

  async function deleteMessage(message: RemoteGroupChatMessage) {
    setMessageToDelete(null);
    setOpenActionId(null);

    try {
      if (remoteClient) {
        await deleteRemoteGroupChatMessage({
          messageId: message.id,
          supabase: remoteClient,
        });
        remoteMessageCache.delete(groupId);
        await refresh();
      } else {
        const nextMessages = messages.filter((item) => item.id !== message.id);
        setMessages(nextMessages);
        writeLocalMessages(groupId, nextMessages);
      }

      setToastMessage("Message deleted");
    } catch {
      setFeedback("Message could not be deleted.");
    }
  }

  async function reportMessage(message: RemoteGroupChatMessage) {
    setOpenActionId(null);

    try {
      if (remoteClient) {
        await reportRemoteGroupChatMessage({
          messageId: message.id,
          supabase: remoteClient,
        });
      }
      setToastMessage("Message reported");
    } catch {
      setFeedback("Message could not be reported.");
    }
  }

  function scrollToLatest() {
    const messageList = messageListRef.current;
    if (!messageList) return;

    shouldScrollToBottomRef.current = false;
    isNearBottomRef.current = true;
    setUnreadCount(0);
    messageList.scrollTo({ behavior: "smooth", top: messageList.scrollHeight });
  }

  return (
    <>
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
          onScroll={(event) => {
            const element = event.currentTarget;
            const nearBottom =
              element.scrollHeight - element.scrollTop - element.clientHeight <
              96;
            isNearBottomRef.current = nearBottom;
            if (nearBottom) setUnreadCount(0);
          }}
          ref={messageListRef}
        >
          {displayedMessages.length ? (
            <>
              {remoteClient && hasMore ? (
                <div className="flex justify-center pb-2">
                  <button
                    className="mac-focus rounded-md px-3 py-1.5 text-xs font-semibold text-[var(--color-text-muted)] transition hover:bg-[rgb(255_255_255/0.045)] hover:text-[var(--color-text)] disabled:opacity-45"
                    disabled={isLoadingOlder}
                    onClick={() => void loadOlderMessages()}
                    type="button"
                  >
                    {isLoadingOlder ? "Loading…" : "Earlier messages"}
                  </button>
                </div>
              ) : null}
              {displayedMessages.map((message, index) => {
                const isOwn = message.userId === selfId;
                const sender = memberById.get(message.userId);
                const previousMessage = displayedMessages[index - 1];
                const startsSenderGroup =
                  !previousMessage ||
                  previousMessage.userId !== message.userId ||
                  new Date(message.createdAt).getTime() -
                    new Date(previousMessage.createdAt).getTime() >
                    5 * 60 * 1000;
                const startsNewDay =
                  !previousMessage ||
                  getMessageDateKey(previousMessage.createdAt) !==
                    getMessageDateKey(message.createdAt);
                const pending =
                  "delivery" in message
                    ? (message as PendingChatMessage)
                    : null;
                const canDelete =
                  !pending && (isOwn || canModerate);

                return (
                  <Fragment key={message.id}>
                    {startsNewDay ? (
                      <div className="flex items-center gap-3 px-2 py-3">
                        <span className="h-px flex-1 bg-[rgb(255_255_255/0.08)]" />
                        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
                          {formatMessageDate(message.createdAt)}
                        </span>
                        <span className="h-px flex-1 bg-[rgb(255_255_255/0.08)]" />
                      </div>
                    ) : null}
                    <div
                      className={cn(
                        "flex",
                        isOwn ? "justify-end" : "justify-start",
                        startsSenderGroup && index > 0 && "pt-2",
                      )}
                    >
                      <div
                        className={cn(
                          "group relative w-fit max-w-[92%] rounded-2xl px-3 py-1.5 sm:max-w-[82%]",
                          isOwn
                            ? "bg-[var(--color-mac-yellow)] text-[#141414]"
                            : "border border-[rgb(255_255_255/0.055)] bg-[var(--color-surface-raised)] text-[var(--color-text)]",
                          pending?.delivery === "sending" && "opacity-70",
                          pending?.delivery === "failed" &&
                            "border border-[rgb(255_107_107/0.55)]",
                        )}
                      >
                        {!isOwn && startsSenderGroup ? (
                          <p className="mb-0.5 text-[10px] font-semibold text-[var(--color-text-muted)]">
                            {sender?.handle ?? "@member"}
                          </p>
                        ) : null}
                        <div className="flex items-start gap-2">
                          <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-sm leading-snug">
                            {message.body}
                          </p>
                          {!pending ? (
                            <button
                              aria-expanded={openActionId === message.id}
                              aria-label="Message actions"
                              className={cn(
                                "mac-focus -mr-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md opacity-65 transition hover:opacity-100",
                                isOwn
                                  ? "text-black/55 hover:bg-black/10"
                                  : "text-[var(--color-text-muted)] hover:bg-white/5",
                              )}
                              onClick={() =>
                                setOpenActionId((current) =>
                                  current === message.id ? null : message.id,
                                )
                              }
                              type="button"
                            >
                              <MoreHorizontal aria-hidden size={14} />
                            </button>
                          ) : null}
                        </div>
                        <p
                          className={cn(
                            "mt-0.5 text-right text-[9px]",
                            isOwn
                              ? "text-black/60"
                              : "text-[var(--color-text-muted)]",
                          )}
                        >
                          {pending?.delivery === "sending"
                            ? "Sending…"
                            : formatMessageTime(message.createdAt)}
                        </p>

                        {openActionId === message.id ? (
                          <div
                            className={cn(
                              "absolute top-8 z-20 grid min-w-28 gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-1.5 shadow-[0_14px_34px_rgb(0_0_0/0.4)]",
                              isOwn ? "right-2" : "left-2",
                            )}
                          >
                            {canDelete ? (
                              <button
                                className="mac-focus flex h-10 items-center gap-2 rounded px-2.5 text-left text-xs font-semibold text-[var(--color-danger)] hover:bg-[rgb(255_107_107/0.07)]"
                                onClick={() => setMessageToDelete(message)}
                                type="button"
                              >
                                <Trash2 aria-hidden size={13} />
                                Delete
                              </button>
                            ) : (
                              <button
                                className="mac-focus flex h-10 items-center gap-2 rounded px-2.5 text-left text-xs font-semibold hover:bg-[rgb(255_255_255/0.055)]"
                                onClick={() => void reportMessage(message)}
                                type="button"
                              >
                                <Flag aria-hidden size={13} />
                                Report
                              </button>
                            )}
                          </div>
                        ) : null}
                      </div>
                    </div>
                    {pending?.delivery === "failed" ? (
                      <div className="flex justify-end">
                        <button
                          className="mac-focus mt-0.5 inline-flex h-8 items-center gap-1 text-[10px] font-semibold text-[var(--color-danger)]"
                          onClick={() => retryMessage(pending)}
                          type="button"
                        >
                          <AlertCircle aria-hidden size={11} />
                          Failed · Retry
                        </button>
                      </div>
                    ) : null}
                  </Fragment>
                );
              })}
            </>
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

        {unreadCount ? (
          <button
            className="mac-focus absolute bottom-[4.75rem] left-1/2 z-30 inline-flex min-h-9 -translate-x-1/2 items-center gap-1.5 rounded-full bg-[var(--color-mac-yellow)] px-3 text-[11px] font-bold text-[#141414] shadow-[0_12px_28px_rgb(0_0_0/0.4)]"
            onClick={scrollToLatest}
            type="button"
          >
            <ArrowDown aria-hidden size={13} />
            {unreadCount === 1 ? "New message" : `${unreadCount} new messages`}
          </button>
        ) : null}

        <form
          className="shrink-0 border-t border-[var(--color-border)] bg-[rgb(23_23_23/0.97)] px-2.5 pb-[max(0.625rem,var(--safe-area-bottom))] pt-2.5 backdrop-blur-xl"
          onSubmit={(event) => {
            event.preventDefault();
            sendMessage();
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
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end overflow-hidden rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-1 transition focus-within:border-[rgb(255_227_48/0.7)] focus-within:shadow-[0_0_0_3px_rgb(255_227_48/0.1)]">
            <textarea
              aria-label="Message"
              className="min-h-10 min-w-0 resize-none overflow-y-auto border-0 bg-transparent px-2.5 py-[0.62rem] text-sm leading-snug text-[var(--color-text)] outline-none"
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
              className="mac-focus inline-flex h-10 w-10 items-center justify-center rounded-md bg-[var(--color-mac-yellow)] text-[#141414] transition active:scale-[0.97] disabled:opacity-45"
              disabled={!draft.trim()}
              onPointerDown={(event) => event.preventDefault()}
              type="submit"
            >
              <Send aria-hidden size={17} />
            </button>
          </div>
        </form>
      </div>
      </section>

      {messageToDelete ? (
        <AppDialog
          closeLabel="Close delete message confirmation"
          footer={
            <div className="grid grid-cols-2 gap-2">
              <button
                className="mac-focus h-11 rounded-md border border-[var(--color-border)] text-sm font-semibold"
                onClick={() => setMessageToDelete(null)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="mac-focus h-11 rounded-md border border-[rgb(255_107_107/0.5)] text-sm font-semibold text-[var(--color-danger)]"
                onClick={() => void deleteMessage(messageToDelete)}
                type="button"
              >
                Delete
              </button>
            </div>
          }
          maxWidthClassName="max-w-sm"
          onClose={() => setMessageToDelete(null)}
          title="Delete message?"
          variant="confirmation"
        >
          <p className="text-sm text-[var(--color-text-muted)]">
            This message will be removed from the group chat.
          </p>
        </AppDialog>
      ) : null}

      <TransientToast
        message={toastMessage}
        onDismiss={() => setToastMessage(null)}
      />
    </>
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
  const page = await fetchRemoteGroupChatMessages(remoteClient, groupId);
  const cached = remoteMessageCache.get(groupId);
  const nextPage = {
    hasMore: cached?.hasMore ?? page.hasMore,
    messages: mergeMessages(cached?.messages ?? [], page.messages),
  };

  remoteMessageCache.set(groupId, nextPage);
  return nextPage;
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

function getMessageDateKey(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function formatMessageDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const key = getMessageDateKey(value);

  if (key === getMessageDateKey(today.toISOString())) return "Today";
  if (key === getMessageDateKey(yesterday.toISOString())) return "Yesterday";

  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
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
