"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AlertCircle, ArrowLeft, MessageCircle, Send } from "lucide-react";
import { PaginatedList } from "@/components/paginated-list";
import type { SocialFriend } from "@/lib/social-state";
import { cn } from "@/lib/utils";

const HISTORY_PAGE_SIZE = 40;
const CONVERSATION_LIMIT = 60;

type DirectMessage = {
  body: string;
  createdAt: string;
  delivery?: "failed" | "sending";
  id: string;
  readAt: string | null;
  recipientId: string;
  senderId: string;
};

type DirectMessageRow = {
  body: string;
  created_at: string;
  message_id: string;
  read_at: string | null;
  recipient_id: string;
  sender_id: string;
};

type DirectMessageInsertRow = {
  body: string;
  created_at: string;
  id: string;
  read_at: string | null;
  recipient_id: string;
  sender_id: string;
};

type ConversationRow = {
  friend_id: string;
  latest_body: string | null;
  latest_created_at: string | null;
  latest_message_id: string | null;
  latest_sender_id: string | null;
  unread_count: number | string;
};

type Conversation = {
  friend: SocialFriend;
  latestBody: string | null;
  latestCreatedAt: string | null;
  latestMessageId: string | null;
  latestSenderId: string | null;
  unreadCount: number;
};

export function DirectMessages({
  currentUserId,
  friends,
  initialFriendId,
  onConversationClosed,
  onConversationOpenChange,
  onUnreadCountChange,
  remoteClient,
}: {
  currentUserId: string | null;
  friends: SocialFriend[];
  initialFriendId: string | null;
  onConversationClosed: () => void;
  onConversationOpenChange?: (open: boolean) => void;
  onUnreadCountChange?: (count: number) => void;
  remoteClient: SupabaseClient | null;
}) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedFriendId, setSelectedFriendId] = useState<string | null>(
    initialFriendId,
  );
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(
    Boolean(initialFriendId && remoteClient),
  );
  const [isLoadingEarlier, setIsLoadingEarlier] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const loadSequenceRef = useRef(0);
  const shouldScrollToBottomRef = useRef(false);
  const friendsRef = useRef(friends);
  const hasLoadedConversationsRef = useRef(false);
  const selectedFriend =
    friends.find((friend) => friend.id === selectedFriendId) ?? null;
  const displayedConversations = useMemo(
    () =>
      remoteClient && currentUserId
        ? conversations.map((conversation) => ({
            ...conversation,
            friend:
              friends.find((friend) => friend.id === conversation.friend.id) ??
              conversation.friend,
          }))
        : friends.slice(0, CONVERSATION_LIMIT).map((friend) => ({
            friend,
            latestBody: null,
            latestCreatedAt: null,
            latestMessageId: null,
            latestSenderId: null,
            unreadCount: 0,
          })),
    [conversations, currentUserId, friends, remoteClient],
  );

  const refreshConversations = useCallback(async () => {
    if (!remoteClient || !currentUserId) return;

    const { data, error } = await remoteClient.rpc(
      "list_direct_conversations",
      { result_limit: CONVERSATION_LIMIT },
    );

    if (error) throw error;

    const rows = (data ?? []) as ConversationRow[];
    const latestFriends = friendsRef.current;
    const friendById = new Map(
      latestFriends.map((friend) => [friend.id, friend]),
    );
    const seenFriendIds = new Set<string>();
    const next: Conversation[] = [];

    rows.forEach((row) => {
      const friend = friendById.get(row.friend_id);
      if (!friend || seenFriendIds.has(friend.id)) return;

      seenFriendIds.add(friend.id);
      next.push({
        friend,
        latestBody: row.latest_body,
        latestCreatedAt: row.latest_created_at,
        latestMessageId: row.latest_message_id,
        latestSenderId: row.latest_sender_id,
        unreadCount: Number(row.unread_count ?? 0),
      });
    });

    latestFriends
      .filter((friend) => !seenFriendIds.has(friend.id))
      .sort((first, second) => first.name.localeCompare(second.name))
      .forEach((friend) => {
        if (next.length >= CONVERSATION_LIMIT) return;

        next.push({
          friend,
          latestBody: null,
          latestCreatedAt: null,
          latestMessageId: null,
          latestSenderId: null,
          unreadCount: 0,
        });
      });

    setConversations(next);
  }, [currentUserId, remoteClient]);

  useEffect(() => {
    friendsRef.current = friends;
  }, [friends]);

  useEffect(() => {
    onConversationOpenChange?.(Boolean(selectedFriend));
  }, [onConversationOpenChange, selectedFriend]);

  useEffect(() => {
    if (!hasLoadedConversationsRef.current) return;

    onUnreadCountChange?.(
      conversations.reduce(
        (total, conversation) => total + conversation.unreadCount,
        0,
      ),
    );
  }, [conversations, isLoadingConversations, onUnreadCountChange]);

  const markConversationRead = useCallback(
    async (friendId: string) => {
      if (!remoteClient || !currentUserId) return;

      const { error } = await remoteClient
        .from("direct_messages")
        .update({ read_at: new Date().toISOString() })
        .eq("recipient_id", currentUserId)
        .eq("sender_id", friendId)
        .is("read_at", null);

      if (!error) {
        setConversations((current) =>
          current.map((conversation) =>
            conversation.friend.id === friendId
              ? { ...conversation, unreadCount: 0 }
              : conversation,
          ),
        );
      }
    },
    [currentUserId, remoteClient],
  );

  const loadMessages = useCallback(
    async ({
      before,
      friendId,
    }: {
      before?: DirectMessage;
      friendId: string;
    }) => {
      if (!remoteClient) return;

      const { data, error } = await remoteClient.rpc("list_direct_messages", {
        before_created_at: before?.createdAt ?? null,
        before_message_id: before?.id ?? null,
        result_limit: HISTORY_PAGE_SIZE + 1,
        target_friend_id: friendId,
      });

      if (error) throw error;

      const rows = (data ?? []) as DirectMessageRow[];
      const page = rows
        .slice(0, HISTORY_PAGE_SIZE)
        .map(directMessageFromRpcRow)
        .reverse();
      setHasMore(rows.length > HISTORY_PAGE_SIZE);
      setMessages((current) =>
        before
          ? mergeMessages(page, current)
          : mergeMessages(
              page,
              current.filter((message) => message.delivery),
            ),
      );
    },
    [remoteClient],
  );

  useEffect(() => {
    let cancelled = false;

    if (!remoteClient || !currentUserId) {
      return;
    }

    window.queueMicrotask(() => {
      if (cancelled) return;

      if (!hasLoadedConversationsRef.current) {
        setIsLoadingConversations(true);
      }
      void refreshConversations()
        .catch(() => {
          if (!cancelled) setFeedback("Messages could not be loaded.");
        })
        .finally(() => {
          if (!cancelled) {
            hasLoadedConversationsRef.current = true;
            setIsLoadingConversations(false);
          }
        });
    });

    return () => {
      cancelled = true;
    };
  }, [currentUserId, refreshConversations, remoteClient]);

  useEffect(() => {
    if (!selectedFriend || !remoteClient) return;

    let cancelled = false;
    const sequence = ++loadSequenceRef.current;
    shouldScrollToBottomRef.current = true;

    window.queueMicrotask(() => {
      if (cancelled) return;

      void loadMessages({ friendId: selectedFriend.id })
        .then(() => {
          if (sequence !== loadSequenceRef.current) return;
          return markConversationRead(selectedFriend.id);
        })
        .catch(() => {
          if (sequence === loadSequenceRef.current) {
            setFeedback("This conversation could not be loaded.");
          }
        })
        .finally(() => {
          if (sequence === loadSequenceRef.current) {
            setIsLoadingMessages(false);
          }
        });
    });

    return () => {
      cancelled = true;
    };
  }, [loadMessages, markConversationRead, remoteClient, selectedFriend]);

  useEffect(() => {
    if (!remoteClient || !currentUserId) return;

    const channel = remoteClient
      .channel(
        `mac-study-direct-messages-${currentUserId}-${Math.random()
          .toString(36)
          .slice(2)}`,
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "direct_messages",
        },
        (payload) => {
          const row = payload.new as DirectMessageInsertRow;
          if (
            row.sender_id !== currentUserId &&
            row.recipient_id !== currentUserId
          ) {
            return;
          }

          const counterpartId =
            row.sender_id === currentUserId ? row.recipient_id : row.sender_id;
          if (counterpartId === selectedFriendId) {
            shouldScrollToBottomRef.current = true;
            setMessages((current) =>
              mergeMessages(current, [directMessageFromInsertRow(row)]),
            );

            if (
              row.recipient_id === currentUserId &&
              document.visibilityState === "visible"
            ) {
              void markConversationRead(counterpartId);
            }
          }

          void refreshConversations().catch(() => undefined);
        },
      )
      .subscribe();

    return () => {
      void remoteClient.removeChannel(channel);
    };
  }, [
    currentUserId,
    markConversationRead,
    refreshConversations,
    remoteClient,
    selectedFriendId,
  ]);

  useLayoutEffect(() => {
    if (!shouldScrollToBottomRef.current || !listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
    shouldScrollToBottomRef.current = false;
  }, [messages]);

  async function loadEarlier() {
    const oldest = messages.find((message) => !message.delivery);
    if (!selectedFriend || !oldest || isLoadingEarlier) return;

    setIsLoadingEarlier(true);
    setFeedback(null);
    try {
      await loadMessages({ before: oldest, friendId: selectedFriend.id });
    } catch {
      setFeedback("Earlier messages could not be loaded.");
    } finally {
      setIsLoadingEarlier(false);
    }
  }

  async function sendMessage(messageBody = draft) {
    const body = messageBody.trim();
    if (
      !body ||
      !selectedFriend ||
      !currentUserId ||
      !remoteClient ||
      isSending
    ) {
      return;
    }

    const pendingId = `pending-${crypto.randomUUID()}`;
    const pendingMessage: DirectMessage = {
      body,
      createdAt: new Date().toISOString(),
      delivery: "sending",
      id: pendingId,
      readAt: null,
      recipientId: selectedFriend.id,
      senderId: currentUserId,
    };

    setDraft("");
    setFeedback(null);
    setIsSending(true);
    shouldScrollToBottomRef.current = true;
    setMessages((current) => mergeMessages(current, [pendingMessage]));

    try {
      const response = await fetch("/api/friends/messages", {
        body: JSON.stringify({ body, friendId: selectedFriend.id }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const result = (await response.json().catch(() => null)) as {
        message?: DirectMessage | string;
      } | null;
      const sentMessage = result?.message;

      if (!response.ok || !sentMessage || typeof sentMessage === "string") {
        throw new Error(
          typeof sentMessage === "string"
            ? sentMessage
            : "Message could not be sent.",
        );
      }

      setMessages((current) =>
        mergeMessages(
          current.filter((message) => message.id !== pendingId),
          [sentMessage],
        ),
      );
      void refreshConversations().catch(() => undefined);
    } catch (error) {
      setMessages((current) =>
        current.map((message) =>
          message.id === pendingId
            ? { ...message, delivery: "failed" }
            : message,
        ),
      );
      setFeedback(getErrorMessage(error, "Message could not be sent."));
    } finally {
      setIsSending(false);
    }
  }

  function retryMessage(message: DirectMessage) {
    setMessages((current) => current.filter((item) => item.id !== message.id));
    void sendMessage(message.body);
  }

  function openConversation(friendId: string) {
    onConversationOpenChange?.(true);
    setSelectedFriendId(friendId);
    setMessages([]);
    setFeedback(null);
    setIsLoadingMessages(Boolean(remoteClient));
  }

  if (selectedFriend) {
    return (
      <section
        aria-label={`Messages with ${selectedFriend.name}`}
        className="fixed inset-x-0 top-0 z-50 flex h-[var(--app-viewport-height)] flex-col overflow-hidden bg-[var(--color-background)] lg:relative lg:inset-auto lg:z-auto lg:h-[calc(100dvh-11rem)] lg:min-h-[32rem] lg:max-h-[760px] lg:rounded-lg lg:border lg:border-[var(--color-border)]"
      >
        <header className="flex shrink-0 items-center gap-3 border-b border-[var(--color-border)] px-3 pb-3 pt-[max(0.75rem,var(--safe-area-top))] lg:p-3">
          <button
            aria-label="Back to messages"
            className="mac-focus inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-[var(--color-text-muted)]"
            onClick={() => {
              onConversationOpenChange?.(false);
              setSelectedFriendId(null);
              setMessages([]);
              setFeedback(null);
              onConversationClosed();
            }}
            type="button"
          >
            <ArrowLeft aria-hidden size={19} />
          </button>
          <FriendAvatar friend={selectedFriend} />
          <div className="min-w-0">
            <h2 className="truncate font-semibold">{selectedFriend.name}</h2>
            <p className="truncate text-xs text-[var(--color-text-muted)]">
              {selectedFriend.handle}
            </p>
          </div>
        </header>

        <div
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4"
          ref={listRef}
        >
          {hasMore ? (
            <div className="mb-4 flex justify-center">
              <button
                className="mac-focus min-h-9 rounded-full border border-[var(--color-border)] px-3 text-xs font-semibold text-[var(--color-text-muted)]"
                disabled={isLoadingEarlier}
                onClick={() => void loadEarlier()}
                type="button"
              >
                {isLoadingEarlier ? "Loading…" : "Earlier messages"}
              </button>
            </div>
          ) : null}

          {isLoadingMessages ? (
            <p className="py-10 text-center text-sm text-[var(--color-text-muted)]">
              Loading messages…
            </p>
          ) : messages.length ? (
            <div className="space-y-2.5">
              {messages.map((message) => {
                const isOwn = message.senderId === currentUserId;

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
                        "flex max-w-[82%] flex-col",
                        isOwn ? "items-end" : "items-start",
                      )}
                    >
                      <div
                        className={cn(
                          "whitespace-pre-wrap break-words rounded-lg px-3.5 py-2.5 text-sm leading-5",
                          isOwn
                            ? "rounded-br-sm bg-[var(--color-mac-yellow)] text-[#141414]"
                            : "rounded-bl-sm bg-[var(--color-surface-raised)] text-[var(--color-text)]",
                        )}
                      >
                        {message.body}
                      </div>
                      <div
                        className={cn(
                          "mt-1 flex items-center gap-1.5 px-1 text-[10px] text-[var(--color-text-muted)]",
                          isOwn ? "justify-end" : "justify-start",
                        )}
                      >
                        <span>{formatMessageTime(message.createdAt)}</span>
                        {message.delivery === "sending" ? (
                          <span>Sending…</span>
                        ) : null}
                        {message.delivery === "failed" ? (
                          <button
                            className="mac-focus inline-flex items-center gap-1 font-semibold text-[var(--color-danger)]"
                            onClick={() => retryMessage(message)}
                            type="button"
                          >
                            <AlertCircle aria-hidden size={11} />
                            Retry
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex h-full min-h-64 flex-col items-center justify-center px-6 text-center text-[var(--color-text-muted)]">
              <MessageCircle aria-hidden size={30} />
              <p className="mt-3 font-semibold text-[var(--color-text)]">
                Message {selectedFriend.name}
              </p>
              <p className="mt-1 text-sm">Only you two can see this chat.</p>
            </div>
          )}
        </div>

        <form
          className="shrink-0 border-t border-[var(--color-border)] bg-[rgb(23_23_23/0.97)] px-3 pb-[max(0.75rem,var(--safe-area-bottom))] pt-3 backdrop-blur-xl"
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
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end overflow-hidden rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-1 focus-within:border-[rgb(255_227_48/0.7)] focus-within:shadow-[0_0_0_3px_rgb(255_227_48/0.1)]">
            <textarea
              aria-label={`Message ${selectedFriend.name}`}
              className="max-h-28 min-h-10 min-w-0 resize-none overflow-y-auto border-0 bg-transparent px-3 py-[0.62rem] text-sm leading-snug outline-none"
              maxLength={2000}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder="Message…"
              rows={1}
              value={draft}
            />
            <button
              aria-label="Send message"
              className="mac-focus inline-flex h-10 w-10 items-center justify-center rounded-md bg-[var(--color-mac-yellow)] text-[#141414] transition active:scale-[0.97] disabled:opacity-45"
              disabled={!draft.trim() || isSending || !remoteClient}
              type="submit"
            >
              <Send aria-hidden size={17} />
            </button>
          </div>
        </form>
      </section>
    );
  }

  return (
    <section className="space-y-2" role="tabpanel">
      {feedback ? (
        <p
          className="rounded-md bg-[rgb(255_107_107/0.08)] px-3 py-2 text-sm text-[var(--color-danger)]"
          role="status"
        >
          {feedback}
        </p>
      ) : null}

      {isLoadingConversations && !displayedConversations.length ? (
        <p className="py-10 text-center text-sm text-[var(--color-text-muted)]">
          Loading messages…
        </p>
      ) : displayedConversations.length ? (
        <PaginatedList
          className="space-y-2"
          items={displayedConversations}
          pageSize={12}
          renderItem={(conversation) => (
            <button
              className="mac-focus grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-[rgb(255_255_255/0.055)] bg-[rgb(255_255_255/0.028)] px-3 py-3 text-left transition hover:border-[rgb(255_255_255/0.12)] hover:bg-[rgb(255_255_255/0.045)]"
              key={conversation.friend.id}
              onClick={() => openConversation(conversation.friend.id)}
              type="button"
            >
              <FriendAvatar friend={conversation.friend} />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">
                  {conversation.friend.name}
                </span>
                <span className="mt-0.5 block truncate text-xs text-[var(--color-text-muted)]">
                  {conversation.latestBody
                    ? `${conversation.latestSenderId === currentUserId ? "You: " : ""}${conversation.latestBody}`
                    : "Start a conversation"}
                </span>
              </span>
              <span className="flex min-w-10 flex-col items-end gap-1">
                {conversation.latestCreatedAt ? (
                  <span className="text-[10px] text-[var(--color-text-muted)]">
                    {formatConversationTime(conversation.latestCreatedAt)}
                  </span>
                ) : null}
                {conversation.unreadCount ? (
                  <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--color-mac-yellow)] px-1 text-[10px] font-bold text-[#141414]">
                    {conversation.unreadCount > 99
                      ? "99+"
                      : conversation.unreadCount}
                  </span>
                ) : null}
              </span>
            </button>
          )}
          resetKey="direct-conversations"
        />
      ) : (
        <div className="py-6 text-center">
          <MessageCircle
            aria-hidden
            className="mx-auto text-[var(--color-text-muted)]"
            size={28}
          />
          <p className="mt-3 font-semibold">No friends to message yet</p>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            Accept a friend request to start a private chat.
          </p>
        </div>
      )}
    </section>
  );
}

function FriendAvatar({ friend }: { friend: SocialFriend }) {
  return (
    <span
      aria-hidden
      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold text-[#141414]"
      style={{ backgroundColor: friend.color }}
    >
      {friend.initials}
    </span>
  );
}

function directMessageFromRpcRow(row: DirectMessageRow): DirectMessage {
  return {
    body: row.body,
    createdAt: row.created_at,
    id: row.message_id,
    readAt: row.read_at,
    recipientId: row.recipient_id,
    senderId: row.sender_id,
  };
}

function directMessageFromInsertRow(
  row: DirectMessageInsertRow,
): DirectMessage {
  return {
    body: row.body,
    createdAt: row.created_at,
    id: row.id,
    readAt: row.read_at,
    recipientId: row.recipient_id,
    senderId: row.sender_id,
  };
}

function mergeMessages(current: DirectMessage[], incoming: DirectMessage[]) {
  const byId = new Map(current.map((message) => [message.id, message]));
  incoming.forEach((message) => byId.set(message.id, message));

  return [...byId.values()].sort(
    (first, second) =>
      new Date(first.createdAt).getTime() -
        new Date(second.createdAt).getTime() ||
      first.id.localeCompare(second.id),
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

function formatConversationTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return formatMessageTime(value);
  }

  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
  }).format(date);
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}
