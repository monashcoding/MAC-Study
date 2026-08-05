"use client";
/* eslint-disable @next/next/no-img-element */

import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AlertCircle,
  ArrowDown,
  ArrowLeft,
  Copy,
  Eye,
  ImagePlus,
  MessageCircle,
  MoreVertical,
  Reply,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { AppDialog } from "@/components/app-dialog";
import { TransientToast } from "@/components/transient-toast";
import type { SocialFriend } from "@/lib/social-state";
import {
  deleteRemoteGroupChatMessage,
  deleteRemoteGroupChatImage,
  fetchRemoteGroupChatMessages,
  sendRemoteGroupChatMessage,
  subscribeToRemoteGroupChat,
  uploadRemoteGroupChatImage,
  type RemoteGroupChatMessage,
  type RemoteGroupChatPage,
} from "@/lib/supabase/app-data";
import {
  fetchGroupChatReadReceipts,
  markGroupChatRead,
  subscribeToGroupChatReadReceipts,
  type GroupChatReadReceipt,
} from "@/lib/supabase/group-chat-read-receipts";
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
  imageFile?: File;
};

type ImageDraft = {
  file: File;
  previewUrl: string;
};

type HeldMessageAction = {
  left: number;
  message: RemoteGroupChatMessage;
  top: number;
};

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
  onRead,
  remoteClient,
}: {
  currentUserId: string | null;
  groupId: string;
  groupName: string;
  members: SocialFriend[];
  onBack: () => void;
  onRead?: (groupId: string) => void;
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
  const [imageDraft, setImageDraft] = useState<ImageDraft | null>(null);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [pendingMessages, setPendingMessages] = useState<PendingChatMessage[]>(
    [],
  );
  const [feedback, setFeedback] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [readReceipts, setReadReceipts] = useState<GroupChatReadReceipt[]>([]);
  const [expandedSeenByMessageId, setExpandedSeenByMessageId] = useState<
    string | null
  >(null);
  const [openActionId, setOpenActionId] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<RemoteGroupChatMessage | null>(
    null,
  );
  const [heldMessage, setHeldMessage] = useState<HeldMessageAction | null>(
    null,
  );
  const [messageToDelete, setMessageToDelete] =
    useState<RemoteGroupChatMessage | null>(null);
  const chatRef = useRef<HTMLElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const objectUrlsRef = useRef(new Set<string>());
  const closeTimerRef = useRef<number | null>(null);
  const hasPositionedMessagesRef = useRef(false);
  const messageListRef = useRef<HTMLDivElement>(null);
  const onBackRef = useRef(onBack);
  const prependScrollHeightRef = useRef<number | null>(null);
  const shouldScrollToBottomRef = useRef(true);
  const isNearBottomRef = useRef(true);
  const messageIdsRef = useRef(new Set(messages.map((message) => message.id)));
  const messageHoldRef = useRef<{
    startX: number;
    startY: number;
    timer: number;
  } | null>(null);
  const selfId = currentUserId ?? "you";
  const memberById = new Map(members.map((member) => [member.id, member]));
  const displayedMessages = mergeMessages(messages, pendingMessages);
  const messageById = new Map(
    displayedMessages.map((message) => [message.id, message]),
  );
  const replyingToSender = replyingTo
    ? memberById.get(replyingTo.userId)
    : null;
  const latestMessage = messages[messages.length - 1] ?? null;
  const latestMessageId = latestMessage?.id ?? null;
  const latestOwnMessage =
    [...messages].reverse().find((message) => message.userId === selfId) ??
    null;
  const receiptByUserId = new Map(
    readReceipts.map((receipt) => [receipt.userId, receipt]),
  );
  const latestOwnMessageReaders = latestOwnMessage
    ? members
        .filter((member) => {
          if (member.id === selfId) return false;

          const receipt = receiptByUserId.get(member.id);
          return (
            receipt !== undefined &&
            new Date(receipt.lastReadAt).getTime() >=
              new Date(latestOwnMessage.createdAt).getTime()
          );
        })
        .sort((first, second) => first.name.localeCompare(second.name))
    : [];
  const isSeenByExpanded = expandedSeenByMessageId === latestOwnMessage?.id;

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

  const markLatestRead = useCallback(async () => {
    if (
      !remoteClient ||
      !currentUserId ||
      document.visibilityState !== "visible" ||
      !isNearBottomRef.current
    ) {
      return;
    }

    const workspace = chatRef.current?.closest<HTMLElement>(
      "[data-workspace-view]",
    );
    if (workspace?.getAttribute("aria-hidden") === "true") return;

    try {
      const receipt = await markGroupChatRead({
        groupId,
        supabase: remoteClient,
        userId: currentUserId,
      });

      if (receipt) {
        setReadReceipts((current) => mergeReadReceipts(current, [receipt]));
        onRead?.(groupId);
      }
    } catch {
      // Read receipts are best-effort and should never interrupt chat.
    }
  }, [currentUserId, groupId, onRead, remoteClient]);

  useEffect(() => {
    onBackRef.current = onBack;
  }, [onBack]);

  useEffect(() => {
    messageIdsRef.current = new Set(messages.map((message) => message.id));
  }, [messages]);

  useEffect(() => {
    if (!remoteClient) return;

    let cancelled = false;
    void fetchGroupChatReadReceipts(remoteClient, groupId)
      .then((receipts) => {
        if (!cancelled) {
          setReadReceipts((current) => mergeReadReceipts(current, receipts));
        }
      })
      .catch(() => undefined);

    const unsubscribe = subscribeToGroupChatReadReceipts(
      remoteClient,
      groupId,
      (receipt) => {
        if (!cancelled) {
          setReadReceipts((current) => mergeReadReceipts(current, [receipt]));
        }
      },
    );

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [groupId, remoteClient]);

  useEffect(() => {
    if (!remoteClient || !latestMessageId) return;

    const workspace = chatRef.current?.closest<HTMLElement>(
      "[data-workspace-view]",
    );
    const observer = workspace
      ? new MutationObserver(() => void markLatestRead())
      : null;

    observer?.observe(workspace as HTMLElement, {
      attributeFilter: ["aria-hidden"],
      attributes: true,
    });
    document.addEventListener("visibilitychange", markLatestRead);
    const markTimer = window.setTimeout(() => void markLatestRead(), 0);

    return () => {
      window.clearTimeout(markTimer);
      observer?.disconnect();
      document.removeEventListener("visibilitychange", markLatestRead);
    };
  }, [latestMessageId, markLatestRead, remoteClient]);

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
  }, [groupId, refresh, remoteClient, selfId]);

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

    const positionAtBottom = (behavior: ScrollBehavior = "auto") => {
      messageList.scrollTo({
        behavior,
        top: messageList.scrollHeight,
      });
    };

    positionAtBottom(isInitialPosition ? "auto" : "smooth");
    isNearBottomRef.current = true;
    setUnreadCount(0);

    if (isInitialPosition) {
      let secondFrame = 0;
      const firstFrame = window.requestAnimationFrame(() => {
        positionAtBottom();
        secondFrame = window.requestAnimationFrame(() => {
          positionAtBottom();
          shouldScrollToBottomRef.current = false;
        });
      });

      return () => {
        window.cancelAnimationFrame(firstFrame);
        if (secondFrame) window.cancelAnimationFrame(secondFrame);
      };
    }

    shouldScrollToBottomRef.current = false;
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
    const chat = chatRef.current;
    const workspace = chat?.closest<HTMLElement>("[data-workspace-view]");
    const visualViewport = window.visualViewport;
    let frame = 0;

    function isWorkspaceVisible() {
      return !workspace || workspace.getAttribute("aria-hidden") !== "true";
    }

    function sizeChat() {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        if (!chat) return;

        if (
          !isWorkspaceVisible() ||
          !window.matchMedia("(max-width: 1023px)").matches
        ) {
          chat.style.removeProperty("top");
          chat.style.removeProperty("height");
          return;
        }

        const viewportHeight = visualViewport?.height ?? window.innerHeight;
        chat.style.top = `${visualViewport?.offsetTop ?? 0}px`;
        chat.style.height = `${viewportHeight}px`;
      });
    }

    function syncChatVisibility() {
      const visible = isWorkspaceVisible();
      body.classList.toggle("mac-chat-view-active", visible);

      if (!visible) {
        body.classList.remove("mac-chat-composer-active");
      }

      sizeChat();
    }

    function releaseChatLayout() {
      body.classList.remove("mac-chat-view-active", "mac-chat-composer-active");
    }

    function closeForHistoryNavigation() {
      releaseChatLayout();
      onBackRef.current();
    }

    const workspaceObserver = workspace
      ? new MutationObserver(syncChatVisibility)
      : null;
    if (workspace && workspaceObserver) {
      workspaceObserver.observe(workspace, {
        attributeFilter: ["aria-hidden"],
        attributes: true,
      });
    }

    syncChatVisibility();
    window.addEventListener("resize", sizeChat);
    window.addEventListener("pagehide", releaseChatLayout);
    window.addEventListener("popstate", closeForHistoryNavigation);
    visualViewport?.addEventListener("resize", sizeChat);
    visualViewport?.addEventListener("scroll", sizeChat);

    return () => {
      workspaceObserver?.disconnect();
      window.cancelAnimationFrame(frame);
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
      chat?.style.removeProperty("top");
      chat?.style.removeProperty("height");
      body.classList.remove("mac-chat-view-active", "mac-chat-composer-active");
      window.removeEventListener("resize", sizeChat);
      window.removeEventListener("pagehide", releaseChatLayout);
      window.removeEventListener("popstate", closeForHistoryNavigation);
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

  useEffect(
    () => () => {
      if (messageHoldRef.current) {
        window.clearTimeout(messageHoldRef.current.timer);
        messageHoldRef.current = null;
      }
      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      objectUrlsRef.current.clear();
    },
    [],
  );

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

    if (!body && !imageDraft) return;

    const pendingMessage: PendingChatMessage = {
      body,
      createdAt: new Date().toISOString(),
      delivery: "sending",
      groupId,
      id: `pending-${crypto.randomUUID()}`,
      imageFile: imageDraft?.file,
      imagePath: null,
      imageUrl: imageDraft?.previewUrl ?? null,
      replyToId: replyingTo?.id ?? null,
      userId: selfId,
    };

    setPendingMessages((current) => [...current, pendingMessage]);
    setDraft("");
    setImageDraft(null);
    setReplyingTo(null);
    if (imageInputRef.current) imageInputRef.current.value = "";
    setFeedback(null);
    shouldScrollToBottomRef.current = true;
    void deliverPendingMessage(pendingMessage);
  }

  async function deliverPendingMessage(pendingMessage: PendingChatMessage) {
    try {
      if (remoteClient) {
        let imagePath = pendingMessage.imagePath ?? null;

        if (pendingMessage.imageFile) {
          const uploaded = await uploadRemoteGroupChatImage({
            file: pendingMessage.imageFile,
            groupId,
            supabase: remoteClient,
          });
          imagePath = uploaded.imagePath;
          setPendingMessages((current) =>
            current.map((message) =>
              message.id === pendingMessage.id
                ? {
                    ...message,
                    imageFile: undefined,
                    imagePath: uploaded.imagePath,
                    imageUrl: uploaded.imageUrl,
                  }
                : message,
            ),
          );
          revokeObjectUrl(pendingMessage.imageUrl);
        }

        await sendRemoteGroupChatMessage({
          body: pendingMessage.body,
          groupId,
          imagePath,
          replyToId: pendingMessage.replyToId,
        });
        setPendingMessages((current) =>
          current.filter((message) => message.id !== pendingMessage.id),
        );
        revokeObjectUrl(pendingMessage.imageUrl);
        await refresh().catch(() => undefined);
      } else {
        const imageUrl = pendingMessage.imageFile
          ? await readImageAsDataUrl(pendingMessage.imageFile)
          : (pendingMessage.imageUrl ?? null);
        const deliveredMessage: RemoteGroupChatMessage = {
          body: pendingMessage.body,
          createdAt: pendingMessage.createdAt,
          groupId: pendingMessage.groupId,
          id: crypto.randomUUID(),
          imagePath: null,
          imageUrl,
          replyToId: pendingMessage.replyToId,
          userId: pendingMessage.userId,
        };
        const nextMessages = [...messages, deliveredMessage];
        setMessages(nextMessages);
        setPendingMessages((current) =>
          current.filter((message) => message.id !== pendingMessage.id),
        );
        revokeObjectUrl(pendingMessage.imageUrl);
        writeLocalMessages(groupId, nextMessages);
      }
    } catch (error) {
      setPendingMessages((current) =>
        current.map((message) =>
          message.id === pendingMessage.id
            ? { ...message, delivery: "failed" }
            : message,
        ),
      );
      setFeedback(
        error instanceof Error ? error.message : "Message could not be sent.",
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
        if (message.imagePath) {
          await deleteRemoteGroupChatImage({
            imagePath: message.imagePath,
            supabase: remoteClient,
          }).catch(() => undefined);
        }
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

  function startReply(message: RemoteGroupChatMessage) {
    setReplyingTo(message);
    setOpenActionId(null);
    window.requestAnimationFrame(() => composerRef.current?.focus());
  }

  function cancelMessageHold() {
    if (!messageHoldRef.current) return;
    window.clearTimeout(messageHoldRef.current.timer);
    messageHoldRef.current = null;
  }

  function beginMessageHold(
    event: ReactPointerEvent<HTMLDivElement>,
    message: RemoteGroupChatMessage,
  ) {
    if (event.pointerType === "mouse" || "delivery" in message) return;

    cancelMessageHold();
    const messageElement = event.currentTarget;
    messageHoldRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      timer: window.setTimeout(() => {
        const bounds = messageElement.getBoundingClientRect();
        const menuWidth = 156;
        const menuHeight = 48;
        const pagePadding = 8;
        const left = Math.min(
          Math.max(bounds.left, pagePadding),
          window.innerWidth - menuWidth - pagePadding,
        );
        const desiredTop =
          bounds.top >= menuHeight + pagePadding
            ? bounds.top - menuHeight - pagePadding
            : bounds.bottom + pagePadding;
        const top = Math.min(
          Math.max(desiredTop, pagePadding),
          window.innerHeight - menuHeight - pagePadding,
        );

        messageHoldRef.current = null;
        setHeldMessage({ left, message, top });
        setOpenActionId(null);
        navigator.vibrate?.(10);
      }, 450),
    };
  }

  function moveMessageHold(event: ReactPointerEvent<HTMLDivElement>) {
    const hold = messageHoldRef.current;
    if (
      hold &&
      (Math.abs(event.clientX - hold.startX) > 8 ||
        Math.abs(event.clientY - hold.startY) > 8)
    ) {
      cancelMessageHold();
    }
  }

  async function copyMessage(message: RemoteGroupChatMessage) {
    if (!message.body) return;

    try {
      await navigator.clipboard.writeText(message.body);
      setToastMessage("Message copied");
    } catch {
      setFeedback("Message could not be copied.");
    } finally {
      setHeldMessage(null);
      setOpenActionId(null);
    }
  }

  function scrollToLatest() {
    const messageList = messageListRef.current;
    if (!messageList) return;

    shouldScrollToBottomRef.current = false;
    isNearBottomRef.current = true;
    setUnreadCount(0);
    messageList.scrollTo({ behavior: "smooth", top: messageList.scrollHeight });
    void markLatestRead();
  }

  function chooseImage(file: File | null) {
    if (!file) return;

    if (
      !["image/gif", "image/jpeg", "image/png", "image/webp"].includes(
        file.type,
      )
    ) {
      setFeedback("Choose a JPG, PNG, WebP or GIF image.");
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      setFeedback("Photos must be 8 MB or smaller.");
      return;
    }

    setFeedback(null);
    setImageDraft((current) => {
      if (current?.previewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(current.previewUrl);
        objectUrlsRef.current.delete(current.previewUrl);
      }
      const previewUrl = URL.createObjectURL(file);
      objectUrlsRef.current.add(previewUrl);
      return { file, previewUrl };
    });
  }

  function removeImageDraft() {
    setImageDraft((current) => {
      if (current?.previewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(current.previewUrl);
        objectUrlsRef.current.delete(current.previewUrl);
      }
      return null;
    });
    if (imageInputRef.current) imageInputRef.current.value = "";
  }

  function revokeObjectUrl(url: string | null | undefined) {
    if (!url?.startsWith("blob:")) return;
    URL.revokeObjectURL(url);
    objectUrlsRef.current.delete(url);
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
              const wasNearBottom = isNearBottomRef.current;
              const nearBottom =
                element.scrollHeight -
                  element.scrollTop -
                  element.clientHeight <
                96;
              isNearBottomRef.current = nearBottom;
              if (nearBottom) {
                setUnreadCount(0);
                if (!wasNearBottom) void markLatestRead();
              }
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
                  const canDelete = !pending && isOwn;
                  const replyTarget = message.replyToId
                    ? messageById.get(message.replyToId)
                    : null;
                  const replySender = replyTarget
                    ? memberById.get(replyTarget.userId)
                    : null;
                  const showsSeenBy =
                    isOwn &&
                    !pending &&
                    latestOwnMessage?.id === message.id &&
                    latestOwnMessageReaders.length > 0;

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
                            "group/message relative flex w-fit max-w-[92%] flex-col sm:max-w-[82%]",
                            isOwn ? "items-end" : "items-start",
                          )}
                        >
                          <div className="relative w-fit max-w-full">
                            <div
                              className={cn(
                                "relative w-fit max-w-full touch-pan-y select-none rounded-lg px-3 py-1.5 sm:select-text",
                                isOwn
                                  ? "bg-[var(--color-mac-yellow)] text-[#141414]"
                                  : "border border-[rgb(255_255_255/0.055)] bg-[var(--color-surface-raised)] text-[var(--color-text)]",
                                pending?.delivery === "sending" && "opacity-70",
                                pending?.delivery === "failed" &&
                                  "border border-[rgb(255_107_107/0.55)]",
                              )}
                              onContextMenu={(event) => event.preventDefault()}
                              onPointerCancel={cancelMessageHold}
                              onPointerDown={(event) =>
                                beginMessageHold(event, message)
                              }
                              onPointerMove={moveMessageHold}
                              onPointerUp={cancelMessageHold}
                            >
                              {!isOwn && startsSenderGroup ? (
                                <p className="mb-0.5 text-[10px] font-semibold text-[var(--color-text-muted)]">
                                  {sender?.handle ?? "@member"}
                                </p>
                              ) : null}
                              {message.replyToId ? (
                                <div
                                  className={cn(
                                    "mb-1.5 max-w-[17rem] rounded-md border-l-2 px-2 py-1 text-[10px]",
                                    isOwn
                                      ? "border-black/35 bg-black/10 text-black/65"
                                      : "border-[var(--color-mac-yellow)] bg-white/5 text-[var(--color-text-muted)]",
                                  )}
                                >
                                  <p className="truncate font-semibold">
                                    {replySender?.handle ?? "Message"}
                                  </p>
                                  <p className="truncate">
                                    {replyTarget
                                      ? replyTarget.body || "Photo"
                                      : "Message unavailable"}
                                  </p>
                                </div>
                              ) : null}
                              {message.imageUrl ? (
                                <a
                                  className="mb-1 block overflow-hidden rounded-md bg-black/20"
                                  href={message.imageUrl}
                                  rel="noreferrer"
                                  target="_blank"
                                >
                                  {/* Private signed URLs cannot use the static Next image loader. */}
                                  <img
                                    alt={`Photo from ${sender?.handle ?? "group member"}`}
                                    className="max-h-80 w-full max-w-[18rem] object-contain"
                                    loading="lazy"
                                    src={message.imageUrl}
                                  />
                                </a>
                              ) : message.imagePath ? (
                                <div className="mb-1 flex h-32 w-52 items-center justify-center rounded-md bg-black/15 text-xs text-current opacity-60">
                                  Photo unavailable
                                </div>
                              ) : null}
                              <div>
                                {message.body ? (
                                  <p className="whitespace-pre-wrap break-words text-sm leading-snug">
                                    {message.body}
                                  </p>
                                ) : null}
                              </div>
                            </div>
                            {!pending ? (
                              <div
                                className={cn(
                                  "absolute top-1/2 hidden -translate-y-1/2 sm:block",
                                  isOwn ? "-left-7" : "-right-7",
                                )}
                              >
                                <button
                                  aria-expanded={openActionId === message.id}
                                  aria-label="Message actions"
                                  className="mac-focus inline-flex h-8 w-7 items-center justify-center rounded-md text-[var(--color-text-muted)] opacity-55 transition hover:bg-[rgb(255_255_255/0.05)] hover:opacity-100 group-hover/message:opacity-100"
                                  onClick={() =>
                                    setOpenActionId((current) =>
                                      current === message.id
                                        ? null
                                        : message.id,
                                    )
                                  }
                                  type="button"
                                >
                                  <MoreVertical aria-hidden size={16} />
                                </button>
                                {openActionId === message.id ? (
                                  <div
                                    className={cn(
                                      "absolute top-8 z-20 grid min-w-28 gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-1.5 text-[var(--color-text)] shadow-[0_14px_34px_rgb(0_0_0/0.4)]",
                                      isOwn ? "right-0" : "left-0",
                                    )}
                                  >
                                    <button
                                      className="mac-focus flex h-10 items-center gap-2 rounded px-2.5 text-left text-xs font-semibold hover:bg-[rgb(255_255_255/0.055)] disabled:opacity-35"
                                      disabled={!message.body}
                                      onClick={() => void copyMessage(message)}
                                      type="button"
                                    >
                                      <Copy aria-hidden size={13} />
                                      Copy
                                    </button>
                                    <button
                                      className="mac-focus flex h-10 items-center gap-2 rounded px-2.5 text-left text-xs font-semibold hover:bg-[rgb(255_255_255/0.055)]"
                                      onClick={() => startReply(message)}
                                      type="button"
                                    >
                                      <Reply aria-hidden size={13} />
                                      Reply
                                    </button>
                                    {canDelete ? (
                                      <button
                                        className="mac-focus flex h-10 items-center gap-2 rounded px-2.5 text-left text-xs font-semibold text-[var(--color-danger)] hover:bg-[rgb(255_107_107/0.07)]"
                                        onClick={() =>
                                          setMessageToDelete(message)
                                        }
                                        type="button"
                                      >
                                        <Trash2 aria-hidden size={13} />
                                        Delete
                                      </button>
                                    ) : null}
                                  </div>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                          <div
                            className={cn(
                              "mt-0.5 flex max-w-full flex-wrap items-center gap-x-2 gap-y-0.5 px-1 text-[9px] text-[var(--color-text-muted)]",
                              isOwn ? "justify-end" : "justify-start",
                            )}
                          >
                            <span className="whitespace-nowrap">
                              {pending?.delivery === "sending"
                                ? "Sending…"
                                : formatMessageTime(message.createdAt)}
                            </span>
                            {showsSeenBy ? (
                              <button
                                aria-expanded={isSeenByExpanded}
                                aria-label={`Seen by ${formatSeenBy(latestOwnMessageReaders, true)}`}
                                className="mac-focus inline-flex min-w-0 items-center gap-1 rounded-sm text-right transition hover:text-[var(--color-text)] disabled:pointer-events-none"
                                disabled={latestOwnMessageReaders.length <= 2}
                                onClick={() =>
                                  setExpandedSeenByMessageId((current) =>
                                    current === message.id ? null : message.id,
                                  )
                                }
                                type="button"
                              >
                                <Eye aria-hidden size={11} />
                                <span className="min-w-0 break-words">
                                  {formatSeenBy(
                                    latestOwnMessageReaders,
                                    isSeenByExpanded,
                                  )}
                                </span>
                              </button>
                            ) : null}
                          </div>
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
              {unreadCount === 1
                ? "New message"
                : `${unreadCount} new messages`}
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
            {replyingTo ? (
              <div className="mb-2 flex items-center gap-2 rounded-md bg-[rgb(255_255_255/0.045)] px-2.5 py-2">
                <Reply
                  aria-hidden
                  className="shrink-0 text-[var(--color-mac-yellow)]"
                  size={15}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[10px] font-semibold text-[var(--color-mac-yellow)]">
                    Replying to {replyingToSender?.handle ?? "message"}
                  </p>
                  <p className="truncate text-xs text-[var(--color-text-muted)]">
                    {replyingTo.body || "Photo"}
                  </p>
                </div>
                <button
                  aria-label="Cancel reply"
                  className="mac-focus inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[var(--color-text-muted)]"
                  onClick={() => setReplyingTo(null)}
                  type="button"
                >
                  <X aria-hidden size={15} />
                </button>
              </div>
            ) : null}
            {imageDraft ? (
              <div className="mb-2 flex items-center gap-2 rounded-md bg-[rgb(255_255_255/0.04)] p-2">
                {/* Local preview uses a short-lived object URL. */}
                <img
                  alt="Selected photo"
                  className="h-14 w-14 rounded-md object-cover"
                  src={imageDraft.previewUrl}
                />
                <p className="min-w-0 flex-1 truncate text-xs font-medium text-[var(--color-text-muted)]">
                  {imageDraft.file.name}
                </p>
                <button
                  aria-label="Remove selected photo"
                  className="mac-focus inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-[var(--color-text-muted)]"
                  onClick={removeImageDraft}
                  type="button"
                >
                  <X aria-hidden size={16} />
                </button>
              </div>
            ) : null}
            <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-end overflow-hidden rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-1 transition focus-within:border-[rgb(255_227_48/0.7)] focus-within:shadow-[0_0_0_3px_rgb(255_227_48/0.1)]">
              <input
                accept="image/gif,image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={(event) =>
                  chooseImage(event.target.files?.[0] ?? null)
                }
                ref={imageInputRef}
                type="file"
              />
              <button
                aria-label="Add photo"
                className="mac-focus inline-flex h-10 w-10 items-center justify-center rounded-md text-[var(--color-text-muted)] transition hover:bg-[rgb(255_255_255/0.05)] hover:text-[var(--color-text)]"
                onClick={() => imageInputRef.current?.click()}
                onPointerDown={(event) => event.preventDefault()}
                type="button"
              >
                <ImagePlus aria-hidden size={18} />
              </button>
              <textarea
                aria-label="Message"
                className="min-h-10 min-w-0 resize-none overflow-y-auto border-0 bg-transparent px-2.5 py-[0.62rem] text-sm leading-snug text-[var(--color-text)] outline-none"
                maxLength={2000}
                onBlur={() => setComposerFocused(false)}
                onChange={(event) => setDraft(event.target.value)}
                onFocus={() => setComposerFocused(true)}
                onKeyDown={(event) => {
                  if (
                    event.key !== "Enter" ||
                    event.shiftKey ||
                    event.nativeEvent.isComposing
                  ) {
                    return;
                  }

                  event.preventDefault();
                  sendMessage();
                }}
                placeholder="Message the group…"
                ref={composerRef}
                rows={1}
                value={draft}
              />
              <button
                aria-label="Send message"
                className="mac-focus inline-flex h-10 w-10 items-center justify-center rounded-md bg-[var(--color-mac-yellow)] text-[#141414] transition active:scale-[0.97] disabled:opacity-45"
                disabled={!draft.trim() && !imageDraft}
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

      {heldMessage ? (
        <div
          aria-label="Message options"
          aria-modal="true"
          className="fixed inset-0 z-[70] sm:hidden"
          onPointerDown={(event) => {
            if (event.currentTarget === event.target) setHeldMessage(null);
          }}
          role="dialog"
        >
          <div
            className="absolute grid w-max grid-cols-2 overflow-hidden rounded-md border border-[var(--color-border)] bg-[var(--color-surface-raised)] shadow-[0_12px_32px_rgb(0_0_0/0.48)]"
            style={{ left: heldMessage.left, top: heldMessage.top }}
          >
            <button
              className="mac-focus inline-flex h-10 items-center justify-center gap-1.5 border-r border-[var(--color-border)] px-3 text-xs font-semibold disabled:opacity-35"
              disabled={!heldMessage.message.body}
              onClick={() => void copyMessage(heldMessage.message)}
              type="button"
            >
              <Copy aria-hidden size={15} />
              Copy
            </button>
            <button
              className="mac-focus inline-flex h-10 items-center justify-center gap-1.5 px-3 text-xs font-semibold"
              onClick={() => {
                const message = heldMessage.message;
                setHeldMessage(null);
                startReply(message);
              }}
              type="button"
            >
              <Reply aria-hidden size={15} />
              Reply
            </button>
          </div>
        </div>
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

function mergeReadReceipts(
  current: GroupChatReadReceipt[],
  incoming: GroupChatReadReceipt[],
) {
  const byUserId = new Map(current.map((receipt) => [receipt.userId, receipt]));

  incoming.forEach((receipt) => {
    const existing = byUserId.get(receipt.userId);

    if (
      !existing ||
      new Date(receipt.lastReadAt).getTime() >=
        new Date(existing.lastReadAt).getTime()
    ) {
      byUserId.set(receipt.userId, receipt);
    }
  });

  return [...byUserId.values()];
}

function formatSeenBy(members: SocialFriend[], expanded: boolean) {
  const visibleMembers = expanded ? members : members.slice(0, 2);
  const remaining = members.length - visibleMembers.length;
  const names = visibleMembers
    .map((member) => member.name || member.handle)
    .join(", ");

  return remaining > 0 ? `${names} + ${remaining} more` : names;
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
    : new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        hour12: true,
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

function readImageAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Photo could not be read."));
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  });
}
