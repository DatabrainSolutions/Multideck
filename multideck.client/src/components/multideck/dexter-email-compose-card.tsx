import { useEffect, useMemo, useRef, useState } from "react";
import {
  AiEditing,
  AlertCircle,
  Check,
  Eye,
  Scissors,
  SendHorizontal,
  Sparkles,
  Type,
  WandSparkles,
  X,
} from "@/components/icons/hugeicons";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { SpectralBloomShader } from "@/components/multideck/dexter-action-pill";
import { MailProviderMark } from "@/components/multideck/mailbox-provider-switch";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useLanguage } from "@/i18n/language-provider";
import {
  duplicateSentDexterEmailDraft,
  refineDexterEmailDraft,
  recordDexterEmailDraftDelivery,
  updateDexterEmailDraft,
  type DexterEmailDraft,
  type DexterEmailDraftAddress,
} from "@/lib/dexter-api";
import {
  buildReplyRequest,
  createIdempotencyKey,
  dedupeAddresses,
  InboxApiError,
  isLikelyEmailAddress,
  listMailboxes,
  parseAddressInput,
  resolveDefaultOutboundMailbox,
  sendMail,
  type MailAddress,
  type Mailbox,
} from "@/lib/inbox-api";
import { loadDefaultInboxProvider } from "@/lib/inbox-provider-preference";
import { cn } from "@/lib/utils";

type DraftStatus = DexterEmailDraft["delivery"]["status"];
type DraftSaveState = "idle" | "saving" | "saved" | "failed";
type DraftTextSelection = { start: number; end: number; text: string };
type SelectionAnchor = { left: number; top: number };
type ReplacementTransition = { id: number; top: number; height: number };

function selectionAnchorFor(
  textarea: HTMLTextAreaElement,
  start: number,
): SelectionAnchor {
  const computed = window.getComputedStyle(textarea);
  const mirror = document.createElement("div");
  const marker = document.createElement("span");
  const copiedProperties = [
    "font-family",
    "font-size",
    "font-style",
    "font-weight",
    "letter-spacing",
    "line-height",
    "padding-block-start",
    "padding-inline-end",
    "padding-block-end",
    "padding-inline-start",
    "text-align",
    "text-indent",
    "text-transform",
    "word-spacing",
  ];

  for (const property of copiedProperties) {
    mirror.style.setProperty(property, computed.getPropertyValue(property));
  }
  mirror.style.position = "fixed";
  mirror.style.insetInlineStart = "-10000px";
  mirror.style.top = "0";
  mirror.style.visibility = "hidden";
  mirror.style.boxSizing = "border-box";
  mirror.style.width = `${textarea.clientWidth}px`;
  mirror.style.whiteSpace = "pre-wrap";
  mirror.style.overflowWrap = "break-word";
  mirror.textContent = textarea.value.slice(0, start);
  marker.textContent = "\u200b";
  mirror.append(marker);
  document.body.append(mirror);

  const left = Math.max(
    116,
    Math.min(
      textarea.clientWidth - 116,
      marker.offsetLeft - textarea.scrollLeft,
    ),
  );
  const top = Math.max(
    46,
    Math.min(
      textarea.offsetTop + textarea.clientHeight - 8,
      textarea.offsetTop + marker.offsetTop - textarea.scrollTop - 8,
    ),
  );
  mirror.remove();
  return { left, top };
}

function addressText(addresses: DexterEmailDraftAddress[]) {
  return addresses
    .map((address) =>
      address.displayName
        ? `${address.displayName} <${address.address}>`
        : address.address,
    )
    .join(", ");
}

function parseAddresses(value: string) {
  const entries = value
    .split(/[,;\n]/)
    .map((part) => part.trim())
    .filter(Boolean);
  const parsedEntries = entries.map((entry) => parseAddressInput(entry));
  const addresses = dedupeAddresses(parsedEntries.flat());
  return {
    addresses,
    invalid: parsedEntries.some(
      (entry) =>
        entry.length !== 1 || !isLikelyEmailAddress(entry[0]?.address ?? ""),
    ),
  };
}

function sendErrorCopy(error: unknown, t: (value: string) => string) {
  if (!(error instanceof InboxApiError))
    return t(
      "Sending failed. Your draft is still here. Check the details and try again.",
    );
  if (error.code === "offline")
    return t(
      "The provider result is unknown. Your draft is safe. Check your connection, then select the plane again to recover the same send without duplicating it.",
    );
  if (error.code === "reauthorization_required")
    return t(
      "Reconnect this mailbox in Inbox, then try sending again. Your draft is safe.",
    );
  if (error.code === "forbidden")
    return t(
      "You do not have permission to send from this mailbox. Choose another mailbox or ask an administrator for send access.",
    );
  if (error.code === "unauthenticated")
    return t("Sign in again before sending. Your draft is safe.");
  if (error.code === "rate_limited")
    return t(
      "The mail provider is temporarily limiting sends. Wait a moment, then try again.",
    );
  return t(
    "Sending failed. Your draft is still here. Check the details and try again.",
  );
}

function draftAddress(address: MailAddress): DexterEmailDraftAddress {
  return { address: address.address, displayName: address.displayName };
}

function statusCopy(
  status: DraftStatus,
  error: string | null,
  t: (value: string) => string,
) {
  if (error) return error;
  if (status === "sent") return t("Sent through the connected mail provider.");
  if (status === "queued")
    return t(
      "Queued. Select the send control again to check the provider status.",
    );
  if (status === "failed")
    return t(
      "Sending failed. Your draft is still here. Check the details and try again.",
    );
  if (status === "sending")
    return t("Sending through the connected mail provider.");
  return t("Nothing is sent until you select the paper plane.");
}

function DexterRefineSubmit({
  disabled,
  isRefining,
  label,
  shouldReduceMotion,
}: {
  disabled: boolean;
  isRefining: boolean;
  label: string;
  shouldReduceMotion: boolean | null;
}) {
  return (
    <button
      type="submit"
      disabled={disabled}
      aria-label={label}
      title={label}
      className="md-dexter-pill relative grid size-8 shrink-0 place-items-center overflow-hidden rounded-full text-white shadow-[var(--md-shadow-line)] transition-[opacity,scale] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a20)] active:scale-[0.96] disabled:opacity-40 disabled:active:scale-100 motion-reduce:transition-none motion-reduce:active:scale-100"
    >
      <span className="md-dexter-pill__shader" aria-hidden="true">
        <SpectralBloomShader />
      </span>
      <span className="md-dexter-pill__contrast" aria-hidden="true" />
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={isRefining ? "refining" : "send"}
          className="relative z-10 grid place-items-center"
          initial={
            shouldReduceMotion
              ? { opacity: 0 }
              : { opacity: 0, scale: 0.25, filter: "blur(4px)" }
          }
          animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
          exit={
            shouldReduceMotion
              ? { opacity: 0 }
              : { opacity: 0, scale: 0.25, filter: "blur(4px)" }
          }
          transition={{
            type: "spring",
            duration: shouldReduceMotion ? 0 : 0.3,
            bounce: 0,
          }}
        >
          {isRefining ? (
            <WandSparkles
              className="size-3.5"
              strokeWidth={1.7}
              aria-hidden="true"
            />
          ) : (
            <SendHorizontal
              className="size-3.5 rtl:-scale-x-100"
              strokeWidth={1.7}
              aria-hidden="true"
            />
          )}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}

export function DexterEmailComposeCard({
  messageId,
  draft,
  preview = false,
  onDraftChange,
}: {
  messageId: string;
  draft: DexterEmailDraft;
  preview?: boolean;
  onDraftChange?: (draft: DexterEmailDraft) => void;
}) {
  const { direction, t } = useLanguage();
  const shouldReduceMotion = useReducedMotion();
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [mailboxesLoading, setMailboxesLoading] = useState(!preview);
  const [mailboxId, setMailboxId] = useState(draft.mailboxId ?? "");
  const [toText, setToText] = useState(addressText(draft.to));
  const [ccText, setCcText] = useState(addressText(draft.cc));
  const [bccText, setBccText] = useState(addressText(draft.bcc));
  const [subject, setSubject] = useState(draft.subject);
  const [bodyText, setBodyText] = useState(draft.bodyText);
  const [trackOpens, setTrackOpens] = useState(draft.trackOpens);
  const [showCc, setShowCc] = useState(draft.cc.length > 0);
  const [showBcc, setShowBcc] = useState(draft.bcc.length > 0);
  const [status, setStatus] = useState<DraftStatus>(draft.delivery.status);
  const [activeMessageId, setActiveMessageId] = useState(messageId);
  const [activeDraftId, setActiveDraftId] = useState(draft.id);
  const [isEditingCopy, setIsEditingCopy] = useState(false);
  const [isCreatingCopy, setIsCreatingCopy] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [saveState, setSaveState] = useState<DraftSaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [refinementOpen, setRefinementOpen] = useState(false);
  const [refinementInstruction, setRefinementInstruction] = useState("");
  const [refinementSelection, setRefinementSelection] =
    useState<DraftTextSelection | null>(null);
  const [bodySelection, setBodySelection] = useState<DraftTextSelection | null>(
    null,
  );
  const [selectionAnchor, setSelectionAnchor] =
    useState<SelectionAnchor | null>(null);
  const [isRefining, setIsRefining] = useState(false);
  const [refinementError, setRefinementError] = useState<string | null>(null);
  const [replacementTransition, setReplacementTransition] =
    useState<ReplacementTransition | null>(null);
  const [invalidField, setInvalidField] = useState<
    "to" | "cc" | "bcc" | "body" | "mailbox" | null
  >(null);
  const idempotencyKey = useRef(createIdempotencyKey());
  const saveTimer = useRef<number | null>(null);
  const hydratedDraftId = useRef(draft.id);
  const copyRequest = useRef<Promise<{
    messageId: string;
    draft: DexterEmailDraft;
  } | null> | null>(null);
  const refinementRequestId = useRef(0);
  const refinementInputRef = useRef<HTMLInputElement | null>(null);
  const bodyEditorRef = useRef<HTMLTextAreaElement | null>(null);
  const liveSubject = useRef(subject);
  const liveBodyText = useRef(bodyText);
  liveSubject.current = subject;
  liveBodyText.current = bodyText;
  const initialRecipients = useMemo(
    () =>
      new Set(
        [...draft.to, ...draft.cc].map((address) =>
          address.address.toLowerCase(),
        ),
      ),
    [draft.id, draft.to, draft.cc],
  );

  const sendCapableMailboxes = useMemo(
    () =>
      mailboxes.filter(
        (mailbox) =>
          mailbox.outboundEnabled &&
          (mailbox.status === "connected" || mailbox.status === "syncing"),
      ),
    [mailboxes],
  );
  const selectedMailbox =
    sendCapableMailboxes.find((mailbox) => mailbox.id === mailboxId) ?? null;
  const isSentSource =
    draft.delivery.status === "sent" && activeMessageId === messageId;
  const locked = status === "sending";

  function beginEditableCopy() {
    if (
      preview ||
      draft.delivery.status !== "sent" ||
      activeMessageId !== messageId
    )
      return Promise.resolve({
        messageId: activeMessageId,
        draft: currentDraft("draft"),
      });
    if (copyRequest.current) return copyRequest.current;

    setIsEditingCopy(true);
    setIsCreatingCopy(true);
    setCopyFailed(false);
    setStatus("draft");
    setError(null);
    idempotencyKey.current = createIdempotencyKey();

    const request = duplicateSentDexterEmailDraft(messageId)
      .then(({ messageId: copiedMessageId, draft: copiedDraft }) => {
        setActiveMessageId(copiedMessageId);
        setActiveDraftId(copiedDraft.id);
        setSaveState("saved");
        return { messageId: copiedMessageId, draft: copiedDraft };
      })
      .catch((copyError) => {
        setCopyFailed(true);
        setSaveState("failed");
        setError(
          copyError instanceof Error && copyError.message.trim()
            ? copyError.message
            : t("Could not create an editable copy. Try again."),
        );
        return null;
      })
      .finally(() => {
        setIsCreatingCopy(false);
        copyRequest.current = null;
      });
    copyRequest.current = request;
    return request;
  }

  useEffect(() => {
    if (preview) {
      setMailboxes([
        {
          id: "preview-mailbox",
          connectionId: "preview-connection",
          provider: "gmail",
          kind: "personal",
          displayName: "Harry Phillips",
          address: "harry@example.com",
          unreadCount: 0,
          isDefault: true,
          inboundEnabled: true,
          outboundEnabled: true,
          status: "connected",
          lastSyncedAt: null,
          indexStatus: "ready",
          indexedCount: 40,
          estimatedTotal: 40,
          indexPercent: 100,
          coreCoverageStart: "2025-01-01T00:00:00.000Z",
          wasteCoverageStart: "2025-12-02T00:00:00.000Z",
          coreRetentionMonths: 12,
          wasteRetentionDays: 30,
          error: null,
        },
      ]);
      setMailboxId("preview-mailbox");
      setMailboxesLoading(false);
      return;
    }

    let active = true;
    setMailboxesLoading(true);
    void Promise.all([
      listMailboxes(),
      loadDefaultInboxProvider().catch((preferenceError: unknown) => {
        console.warn(
          "Your default inbox provider could not be loaded for this email draft.",
          preferenceError,
        );
        return null;
      }),
    ])
      .then(([items, preferredProvider]) => {
        if (!active) return;
        setMailboxes(items);
        const capable = items.filter(
          (mailbox) =>
            mailbox.outboundEnabled &&
            (mailbox.status === "connected" || mailbox.status === "syncing"),
        );
        setMailboxId((current) =>
          resolveDefaultOutboundMailbox(capable, preferredProvider, current)?.id ?? "",
        );
      })
      .catch(() => {
        if (!active) return;
        setError(
          t(
            "Unable to load a send-capable mailbox. Reconnect it in Inbox and try again.",
          ),
        );
      })
      .finally(() => {
        if (active) setMailboxesLoading(false);
      });
    return () => {
      active = false;
    };
  }, [preview, t]);

  function currentDraft(nextStatus: DraftStatus = status): DexterEmailDraft {
    return {
      ...draft,
      id: activeDraftId,
      mailboxId: mailboxId || null,
      to: parseAddresses(toText).addresses.map(draftAddress),
      cc: parseAddresses(ccText).addresses.map(draftAddress),
      bcc: parseAddresses(bccText).addresses.map(draftAddress),
      subject,
      bodyText,
      trackOpens,
      delivery: isEditingCopy
        ? { status: nextStatus }
        : { ...draft.delivery, status: nextStatus },
    };
  }

  useEffect(() => {
    if (!refinementOpen) return;
    const frame = window.requestAnimationFrame(() => {
      refinementInputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [refinementOpen, refinementSelection?.start, refinementSelection?.end]);

  useEffect(
    () => () => {
      refinementRequestId.current += 1;
    },
    [],
  );

  function updateBodySelection() {
    const editor = bodyEditorRef.current;
    if (!editor) return;
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const text = editor.value.slice(start, end);
    if (end <= start || !text.trim()) {
      setBodySelection(null);
      setSelectionAnchor(null);
      return;
    }
    setBodySelection({ start, end, text });
    setSelectionAnchor(selectionAnchorFor(editor, start));
  }

  async function openRefinement(
    selection: DraftTextSelection | null = null,
    initialInstruction = "",
  ) {
    if (preview || locked || isRefining) return;
    const target = await beginEditableCopy();
    if (!target) return;
    setRefinementSelection(selection);
    setRefinementInstruction(initialInstruction);
    setRefinementError(null);
    setRefinementOpen(true);
  }

  function closeRefinement() {
    if (isRefining) return;
    setRefinementOpen(false);
    setRefinementInstruction("");
    setRefinementSelection(null);
    setRefinementError(null);
  }

  async function performRefinement(
    instruction: string,
    selection: DraftTextSelection | null,
  ) {
    const cleanInstruction = instruction.trim();
    if (!cleanInstruction || isRefining || preview || locked) return;

    const target = await beginEditableCopy();
    if (!target) return;
    if (
      selection &&
      liveBodyText.current.slice(selection.start, selection.end) !==
        selection.text
    ) {
      setRefinementError(t("Select the text again before refining it."));
      return;
    }

    const requestId = ++refinementRequestId.current;
    const snapshotSubject = liveSubject.current;
    const snapshotBodyText = liveBodyText.current;
    const requestDraft: DexterEmailDraft = {
      ...currentDraft("draft"),
      id: target.draft.id,
      subject: snapshotSubject,
      bodyText: snapshotBodyText,
      delivery: target.draft.delivery,
    };
    setIsRefining(true);
    setRefinementError(null);
    setError(null);
    setSaveState("saving");

    try {
      const refinedDraft = await refineDexterEmailDraft({
        messageId: target.messageId,
        instruction: cleanInstruction,
        draft: requestDraft,
        selection: selection
          ? { start: selection.start, end: selection.end }
          : null,
      });
      if (requestId !== refinementRequestId.current) return;
      if (
        liveSubject.current !== snapshotSubject ||
        liveBodyText.current !== snapshotBodyText
      ) {
        setRefinementError(
          t(
            "Your draft changed while Dexter was refining it. Run the refinement again.",
          ),
        );
        setSaveState("saved");
        return;
      }

      liveSubject.current = refinedDraft.subject;
      liveBodyText.current = refinedDraft.bodyText;
      if (selection && !shouldReduceMotion) {
        const estimatedLines = Math.min(
          4,
          Math.max(
            1,
            selection.text.split("\n").length +
              Math.floor(selection.text.length / 72),
          ),
        );
        setReplacementTransition({
          id: requestId,
          top: Math.max(8, (selectionAnchor?.top ?? 54) - 2),
          height: estimatedLines * 24 + 8,
        });
      }
      setSubject(refinedDraft.subject);
      setBodyText(refinedDraft.bodyText);
      setBodySelection(null);
      setSelectionAnchor(null);
      setRefinementSelection(null);
      setRefinementInstruction("");
      setRefinementOpen(false);
      setSaveState("saving");

      try {
        const savedDraft = await updateDexterEmailDraft(
          target.messageId,
          refinedDraft,
        );
        if (requestId !== refinementRequestId.current) return;
        setSaveState("saved");
        if (target.messageId === messageId) onDraftChange?.(savedDraft);
      } catch {
        if (requestId === refinementRequestId.current) setSaveState("failed");
      }
    } catch (refineError) {
      if (requestId !== refinementRequestId.current) return;
      const message =
        refineError instanceof Error && refineError.message.trim()
          ? refineError.message
          : t(
              "Dexter could not refine this draft. Your current wording is unchanged.",
            );
      setRefinementError(message);
      setSaveState("failed");
    } finally {
      if (requestId === refinementRequestId.current) setIsRefining(false);
    }
  }

  function submitRefinement() {
    if (!refinementInstruction.trim()) {
      setRefinementError(t("Describe what you want Dexter to change."));
      refinementInputRef.current?.focus();
      return;
    }
    void performRefinement(refinementInstruction, refinementSelection);
  }

  useEffect(() => {
    if (
      preview ||
      hydratedDraftId.current !== draft.id ||
      isCreatingCopy ||
      copyFailed ||
      status === "sent" ||
      status === "sending"
    )
      return;
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      setSaveState("saving");
      void updateDexterEmailDraft(activeMessageId, currentDraft())
        .then((savedDraft) => {
          setSaveState("saved");
          if (activeMessageId === messageId) onDraftChange?.(savedDraft);
        })
        .catch(() => setSaveState("failed"));
      saveTimer.current = null;
    }, 700);
    return () => {
      if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    };
    // Each editable field deliberately participates in the autosave boundary.
  }, [
    bccText,
    activeDraftId,
    activeMessageId,
    bodyText,
    ccText,
    copyFailed,
    isCreatingCopy,
    mailboxId,
    preview,
    status,
    subject,
    toText,
    trackOpens,
  ]);

  useEffect(() => {
    const sendRequestId = draft.delivery.sendRequestId;
    if (
      preview ||
      !sendRequestId ||
      (draft.delivery.status !== "queued" &&
        draft.delivery.status !== "sending")
    )
      return;
    void recordDexterEmailDraftDelivery(messageId, sendRequestId)
      .then((delivery) => {
        const next = { ...currentDraft(delivery.status), delivery };
        setStatus(delivery.status);
        onDraftChange?.(next);
      })
      .catch(() => undefined);
  }, [draft.delivery.sendRequestId, draft.delivery.status, messageId, preview]);

  async function handleSend() {
    if (preview || isSentSource || locked || isCreatingCopy || copyFailed)
      return;
    setError(null);
    setInvalidField(null);
    const to = parseAddresses(toText);
    const cc = parseAddresses(ccText);
    const bcc = parseAddresses(bccText);
    if (!selectedMailbox) {
      setInvalidField("mailbox");
      setError(t("Choose a connected mailbox that can send email."));
      return;
    }
    if (to.invalid || to.addresses.length === 0) {
      setInvalidField("to");
      setError(t("Add at least one complete email address."));
      return;
    }
    if (cc.invalid) {
      setInvalidField("cc");
      setError(t("Check the Cc address, then try again."));
      return;
    }
    if (bcc.invalid) {
      setInvalidField("bcc");
      setError(t("Check the Bcc address, then try again."));
      return;
    }
    if (!bodyText.trim()) {
      setInvalidField("body");
      setError(t("Write a message before sending."));
      return;
    }

    setStatus("sending");
    const edits = {
      subject,
      bodyText,
      // Inbox performs the authoritative reply/reply-all merge. Supplying the
      // current list lets it deduplicate server-confirmed base recipients while
      // still carrying addresses explicitly added in Dexter's prepared draft.
      addedTo: to.addresses,
      addedCc: cc.addresses,
      addedBcc: bcc.addresses,
      removedAddresses:
        draft.mode === "reply" || draft.mode === "reply_all"
          ? [...initialRecipients].filter(
              (address) =>
                !to.addresses.some(
                  (candidate) => candidate.address.toLowerCase() === address,
                ) &&
                !cc.addresses.some(
                  (candidate) => candidate.address.toLowerCase() === address,
                ),
            )
          : [],
      attachments: [],
      trackOpens,
    };
    const request = {
      ...buildReplyRequest({
        mode: draft.mode,
        mailboxId: selectedMailbox.id,
        threadId: draft.threadId,
        sourceMessageId: draft.sourceMessageId,
        edits,
        idempotencyKey: idempotencyKey.current,
      }),
      subject: subject.trim() || null,
    };

    try {
      const receipt = await sendMail(request);
      const providerStatus: DraftStatus =
        receipt.status === "sent"
          ? "sent"
          : receipt.status === "failed"
            ? "failed"
            : "queued";
      setStatus(providerStatus);
      try {
        const delivery = await recordDexterEmailDraftDelivery(
          activeMessageId,
          receipt.id,
        );
        const next = { ...currentDraft(delivery.status), delivery };
        setStatus(delivery.status);
        if (delivery.status === "failed")
          idempotencyKey.current = createIdempotencyKey();
        if (activeMessageId === messageId) onDraftChange?.(next);
      } catch {
        setError(
          providerStatus === "sent"
            ? t(
                "Sent by the provider, but Dexter could not save the receipt. Refresh this conversation to recover the confirmed status.",
              )
            : providerStatus === "failed"
              ? t(
                  "The provider rejected this email. Your draft is safe, but Dexter could not save the failure receipt. Check the details before trying again.",
                )
              : t(
                  "The provider accepted this email, but Dexter could not save the latest receipt. Select the plane again to recover its status without duplicating the send.",
                ),
        );
      }
    } catch (sendError) {
      setStatus("failed");
      if (
        !(sendError instanceof InboxApiError) ||
        sendError.code !== "offline"
      ) {
        idempotencyKey.current = createIdempotencyKey();
      }
      setError(sendErrorCopy(sendError, t));
    }
  }

  const statusText = statusCopy(status, error, t);
  const visibleStatusText = isCreatingCopy
    ? t("Creating editable copy…")
    : isRefining
      ? t("Refining draft…")
      : refinementError
        ? refinementError
        : copyFailed
          ? (error ?? t("Could not create an editable copy. Try again."))
          : isEditingCopy && saveState !== "saving" && saveState !== "failed"
            ? t("Editing a copy. The sent email is unchanged.")
            : !error && status === "draft"
              ? saveState === "saving"
                ? t("Saving…")
                : saveState === "saved"
                  ? t("Saved")
                  : saveState === "failed"
                    ? t("Draft could not be saved")
                    : statusText
              : statusText;
  const statusIsError =
    Boolean(error) ||
    Boolean(refinementError) ||
    copyFailed ||
    status === "failed" ||
    saveState === "failed";
  const sendLabel = t(
    status === "sent"
      ? "Sent"
      : status === "queued"
        ? "Check status"
        : status === "sending"
          ? "Sending"
          : "Send",
  );
  const selectionRefinementOpen =
    refinementOpen && refinementSelection !== null;
  const wholeDraftRefinementOpen =
    refinementOpen && refinementSelection === null;

  return (
    <section
      aria-label={t("Editable email draft")}
      onPointerDownCapture={() => {
        if (draft.delivery.status === "sent" && activeMessageId === messageId)
          void beginEditableCopy();
      }}
      className="mt-4 overflow-hidden rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] shadow-[var(--md-shadow-soft)]"
    >
      <header className="flex items-center justify-between gap-3 px-5 pb-2 pt-4 sm:px-6 sm:pt-5">
        <div className="min-w-0 flex-1">
          <motion.div
            initial={false}
            animate={{ width: wholeDraftRefinementOpen ? 360 : 40 }}
            transition={
              shouldReduceMotion
                ? { duration: 0 }
                : { duration: 0.22, ease: [0.22, 1, 0.36, 1] }
            }
            className={cn(
              "h-10 max-w-full overflow-hidden rounded-full",
              wholeDraftRefinementOpen &&
                "bg-[var(--md-surface-tint)] shadow-[var(--md-shadow-line)]",
            )}
          >
            <AnimatePresence initial={false} mode="popLayout">
              {wholeDraftRefinementOpen ? (
                <motion.form
                  key="refinement"
                  className="flex h-10 w-full items-center gap-1.5 px-2"
                  initial={
                    shouldReduceMotion
                      ? { opacity: 0 }
                      : { opacity: 0, filter: "blur(4px)" }
                  }
                  animate={{ opacity: 1, filter: "blur(0px)" }}
                  exit={
                    shouldReduceMotion
                      ? { opacity: 0 }
                      : { opacity: 0, filter: "blur(3px)" }
                  }
                  transition={{ duration: shouldReduceMotion ? 0 : 0.14 }}
                  onSubmit={(event) => {
                    event.preventDefault();
                    submitRefinement();
                  }}
                >
                  <AiEditing
                    className="ms-1 size-3 shrink-0 text-[var(--md-subtle)]"
                    strokeWidth={1.4}
                    aria-hidden="true"
                  />
                  <input
                    ref={refinementInputRef}
                    value={refinementInstruction}
                    onChange={(event) =>
                      setRefinementInstruction(event.target.value.slice(0, 800))
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        event.preventDefault();
                        closeRefinement();
                      }
                      if (
                        event.key === "Enter" &&
                        (event.metaKey || event.ctrlKey)
                      ) {
                        event.preventDefault();
                        submitRefinement();
                      }
                    }}
                    disabled={isRefining}
                    aria-label={t("Ask Dexter to refine this draft")}
                    aria-invalid={Boolean(refinementError)}
                    aria-describedby={`${activeDraftId}-status`}
                    placeholder={t("How should this draft change?")}
                    className="h-full min-w-0 flex-1 bg-transparent text-[16px] text-[var(--md-ink)] outline-none placeholder:text-[color-mix(in_srgb,var(--md-text)_70%,transparent)] disabled:opacity-70 sm:text-[13px]"
                  />
                  <button
                    type="button"
                    disabled={isRefining}
                    aria-label={t("Close refinement")}
                    title={t("Close refinement")}
                    onClick={closeRefinement}
                    className="grid size-7 shrink-0 place-items-center rounded-full text-[var(--md-subtle)] transition-colors hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a20)] disabled:opacity-40 motion-reduce:transition-none"
                  >
                    <X
                      className="size-3.5"
                      strokeWidth={1.6}
                      aria-hidden="true"
                    />
                  </button>
                  <DexterRefineSubmit
                    disabled={isRefining}
                    isRefining={isRefining}
                    label={t("Refine draft")}
                    shouldReduceMotion={shouldReduceMotion}
                  />
                </motion.form>
              ) : (
                <motion.button
                  key="edit-icon"
                  type="button"
                  disabled={preview || locked || isCreatingCopy}
                  aria-label={t("Edit email draft")}
                  title={t("Edit email draft")}
                  onClick={() => void openRefinement(null)}
                  className="grid size-9 place-items-center rounded-full bg-[var(--md-surface-tint)] text-[var(--md-subtle)] shadow-[var(--md-shadow-line)] transition-[background-color,color,transform] hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a20)] active:scale-95 disabled:opacity-40 disabled:active:scale-100 motion-reduce:transition-none motion-reduce:active:scale-100"
                  initial={
                    shouldReduceMotion
                      ? { opacity: 0 }
                      : { opacity: 0, scale: 0.8 }
                  }
                  animate={{ opacity: 1, scale: 1 }}
                  exit={
                    shouldReduceMotion
                      ? { opacity: 0 }
                      : { opacity: 0, scale: 0.8 }
                  }
                  transition={{ duration: shouldReduceMotion ? 0 : 0.14 }}
                >
                  <AiEditing
                    className="size-3.5"
                    strokeWidth={1.4}
                    aria-hidden="true"
                  />
                </motion.button>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
        <Button
          type="button"
          disabled={
            preview ||
            isSentSource ||
            locked ||
            isCreatingCopy ||
            copyFailed ||
            !selectedMailbox
          }
          aria-label={t(
            status === "queued"
              ? "Check send status"
              : status === "sent"
                ? "Sent"
                : "Send email",
          )}
          title={t(
            status === "queued"
              ? "Check send status"
              : status === "sent"
                ? "Sent"
                : "Send email",
          )}
          onClick={() => void handleSend()}
          className={cn(
            "md-dexter-pill relative h-11 min-w-[104px] shrink-0 overflow-hidden rounded-full px-3.5 text-[13px] font-medium text-white shadow-[var(--md-shadow-line)] transition-[box-shadow,opacity,scale] duration-150 hover:text-white focus-visible:text-white active:scale-[0.96] disabled:active:scale-100 motion-reduce:transition-none motion-reduce:active:scale-100",
          )}
        >
          <span className="md-dexter-pill__shader" aria-hidden="true">
            <SpectralBloomShader />
          </span>
          <span className="md-dexter-pill__contrast" aria-hidden="true" />
          <AnimatePresence initial={false} mode="popLayout">
            {status === "sent" ? (
              <motion.span
                key="sent"
                className="relative z-10 inline-flex items-center gap-1.5"
                initial={
                  shouldReduceMotion
                    ? { opacity: 0 }
                    : { opacity: 0, scale: 0.25, filter: "blur(4px)" }
                }
                animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                transition={{ type: "spring", duration: 0.3, bounce: 0 }}
              >
                <Check
                  className="size-3.5"
                  strokeWidth={1.8}
                  aria-hidden="true"
                />
                {sendLabel}
              </motion.span>
            ) : status === "sending" ? (
              <motion.span
                key="sending"
                className="relative z-10 inline-flex items-center gap-1.5"
                animate={
                  shouldReduceMotion
                    ? { opacity: [0.45, 1] }
                    : {
                        x: [
                          0,
                          direction === "rtl" ? -10 : 10,
                          direction === "rtl" ? -18 : 18,
                        ],
                        opacity: [1, 0.65, 0],
                        filter: ["blur(0px)", "blur(1px)", "blur(4px)"],
                      }
                }
                transition={{
                  duration: 0.72,
                  repeat: Infinity,
                  ease: "easeOut",
                }}
              >
                <SendHorizontal
                  className="size-3.5 rtl:-scale-x-100"
                  strokeWidth={1.7}
                  aria-hidden="true"
                />
                {sendLabel}
              </motion.span>
            ) : (
              <motion.span
                key="ready"
                className="relative z-10 inline-flex items-center gap-1.5"
                initial={
                  shouldReduceMotion
                    ? { opacity: 0 }
                    : { opacity: 0, scale: 0.85 }
                }
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
              >
                <SendHorizontal
                  className="size-3.5 rtl:-scale-x-100"
                  strokeWidth={1.7}
                  aria-hidden="true"
                />
                {sendLabel}
              </motion.span>
            )}
          </AnimatePresence>
        </Button>
      </header>

      <div className="px-5 sm:px-6">
        <div className="flex min-h-12 items-center gap-3 border-b border-[color-mix(in_srgb,var(--md-ink)_7%,transparent)] transition-colors focus-within:border-[color-mix(in_srgb,var(--md-accent)_34%,transparent)] motion-reduce:transition-none">
          <label
            htmlFor={`${activeDraftId}-mailbox`}
            className="w-14 shrink-0 text-[13px] font-medium text-[var(--md-subtle)]"
          >
            {t("From")}
          </label>
          <Select
            value={mailboxId}
            onValueChange={setMailboxId}
            disabled={
              locked || mailboxesLoading || sendCapableMailboxes.length === 0
            }
          >
            <SelectTrigger
              id={`${activeDraftId}-mailbox`}
              aria-invalid={invalidField === "mailbox"}
              style={{
                background: "transparent",
                borderColor: "transparent",
                boxShadow: "none",
              }}
              className="h-10 min-w-0 flex-1 border-0 bg-transparent px-0 shadow-none focus:ring-0 data-[state=open]:bg-transparent"
            >
              <SelectValue
                placeholder={
                  mailboxesLoading
                    ? t("Loading mailboxes")
                    : t("Choose mailbox")
                }
              />
            </SelectTrigger>
            <SelectContent>
              {sendCapableMailboxes.map((mailbox) => (
                <SelectItem key={mailbox.id} value={mailbox.id}>
                  <MailProviderMark provider={mailbox.provider} />
                  <bdi dir="ltr" data-i18n-skip className="min-w-0 truncate">
                    {mailbox.address}
                  </bdi>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex min-h-12 items-center gap-3 border-b border-[color-mix(in_srgb,var(--md-ink)_7%,transparent)] transition-colors focus-within:border-[color-mix(in_srgb,var(--md-accent)_34%,transparent)] motion-reduce:transition-none">
          <label
            htmlFor={`${activeDraftId}-to`}
            className="w-14 shrink-0 text-[13px] font-medium text-[var(--md-subtle)]"
          >
            {t("To")}
          </label>
          <Input
            id={`${activeDraftId}-to`}
            type="text"
            inputMode="email"
            autoComplete="email"
            dir="ltr"
            data-i18n-skip
            value={toText}
            disabled={locked}
            style={{
              background: "transparent",
              borderColor: "transparent",
              boxShadow: "none",
            }}
            aria-invalid={invalidField === "to"}
            aria-describedby={
              invalidField === "to" ? `${activeDraftId}-status` : undefined
            }
            placeholder="name@example.com"
            onChange={(event) => setToText(event.target.value)}
            className="h-10 min-w-0 flex-1 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
          />
          <div className="flex shrink-0 items-center gap-1">
            {!showCc ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={locked}
                className="h-8 rounded-full px-2 text-[12px] text-[var(--md-subtle)]"
                onClick={() => setShowCc(true)}
              >
                {t("Cc")}
              </Button>
            ) : null}
            {!showBcc ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={locked}
                className="h-8 rounded-full px-2 text-[12px] text-[var(--md-subtle)]"
                onClick={() => setShowBcc(true)}
              >
                {t("Bcc")}
              </Button>
            ) : null}
          </div>
        </div>

        {showCc ? (
          <div className="flex min-h-12 items-center gap-3 border-b border-[color-mix(in_srgb,var(--md-ink)_7%,transparent)] transition-colors focus-within:border-[color-mix(in_srgb,var(--md-accent)_34%,transparent)] motion-reduce:transition-none">
            <label
              htmlFor={`${activeDraftId}-cc`}
              className="w-14 shrink-0 text-[13px] font-medium text-[var(--md-subtle)]"
            >
              {t("Cc")}
            </label>
            <Input
              id={`${activeDraftId}-cc`}
              type="text"
              inputMode="email"
              dir="ltr"
              data-i18n-skip
              value={ccText}
              disabled={locked}
              style={{
                background: "transparent",
                borderColor: "transparent",
                boxShadow: "none",
              }}
              aria-invalid={invalidField === "cc"}
              aria-describedby={
                invalidField === "cc" ? `${activeDraftId}-status` : undefined
              }
              placeholder="name@example.com"
              onChange={(event) => setCcText(event.target.value)}
              className="h-10 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
            />
          </div>
        ) : null}

        {showBcc ? (
          <div className="flex min-h-12 items-center gap-3 border-b border-[color-mix(in_srgb,var(--md-ink)_7%,transparent)] transition-colors focus-within:border-[color-mix(in_srgb,var(--md-accent)_34%,transparent)] motion-reduce:transition-none">
            <label
              htmlFor={`${activeDraftId}-bcc`}
              className="w-14 shrink-0 text-[13px] font-medium text-[var(--md-subtle)]"
            >
              {t("Bcc")}
            </label>
            <Input
              id={`${activeDraftId}-bcc`}
              type="text"
              inputMode="email"
              dir="ltr"
              data-i18n-skip
              value={bccText}
              disabled={locked}
              style={{
                background: "transparent",
                borderColor: "transparent",
                boxShadow: "none",
              }}
              aria-invalid={invalidField === "bcc"}
              aria-describedby={
                invalidField === "bcc" ? `${activeDraftId}-status` : undefined
              }
              placeholder="name@example.com"
              onChange={(event) => setBccText(event.target.value)}
              className="h-10 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
            />
          </div>
        ) : null}

        <div className="flex min-h-12 items-center gap-3 border-b border-[color-mix(in_srgb,var(--md-ink)_7%,transparent)] transition-colors focus-within:border-[color-mix(in_srgb,var(--md-accent)_34%,transparent)] motion-reduce:transition-none">
          <label
            htmlFor={`${activeDraftId}-subject`}
            className="w-14 shrink-0 text-[13px] font-medium text-[var(--md-subtle)]"
          >
            {t("Subject")}
          </label>
          <Input
            id={`${activeDraftId}-subject`}
            type="text"
            dir="auto"
            data-i18n-skip
            value={subject}
            disabled={locked}
            style={{
              background: "transparent",
              borderColor: "transparent",
              boxShadow: "none",
            }}
            placeholder={t("Add a subject")}
            onChange={(event) => setSubject(event.target.value)}
            className="h-10 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
          />
        </div>

        <div className="relative rounded-[var(--md-radius-md)] py-4 sm:py-5">
          <label htmlFor={`${activeDraftId}-body`} className="sr-only">
            {t("Message")}
          </label>
          <AnimatePresence initial={false}>
            {bodySelection && selectionAnchor ? (
              <motion.div
                key={`${bodySelection.start}-${bodySelection.end}`}
                role="group"
                aria-label={t("Selected text actions")}
                layout
                style={{ left: "50%", top: selectionAnchor.top }}
                className={cn(
                  "absolute z-20 -translate-x-1/2 -translate-y-full rounded-full bg-[var(--md-surface-tint)] p-1 text-[var(--md-text)] shadow-[var(--md-shadow-lift)]",
                  selectionRefinementOpen
                    ? "w-[360px] max-w-[calc(100%_-_16px)]"
                    : "w-auto",
                )}
                initial={
                  shouldReduceMotion
                    ? { opacity: 0 }
                    : { opacity: 0, y: 4, scale: 0.97, filter: "blur(4px)" }
                }
                animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
                exit={
                  shouldReduceMotion
                    ? { opacity: 0 }
                    : { opacity: 0, y: 3, scale: 0.98, filter: "blur(3px)" }
                }
                transition={{
                  duration: shouldReduceMotion ? 0 : 0.16,
                  ease: [0.22, 1, 0.36, 1],
                }}
                onPointerDown={(event) => {
                  if (!selectionRefinementOpen) event.preventDefault();
                }}
              >
                <AnimatePresence initial={false} mode="popLayout">
                  {selectionRefinementOpen ? (
                    <motion.form
                      key="selection-refinement"
                      className="flex h-10 w-full items-center gap-1.5 px-1"
                      initial={
                        shouldReduceMotion
                          ? { opacity: 0 }
                          : { opacity: 0, filter: "blur(4px)" }
                      }
                      animate={{ opacity: 1, filter: "blur(0px)" }}
                      exit={
                        shouldReduceMotion
                          ? { opacity: 0 }
                          : { opacity: 0, filter: "blur(3px)" }
                      }
                      transition={{ duration: shouldReduceMotion ? 0 : 0.14 }}
                      onSubmit={(event) => {
                        event.preventDefault();
                        submitRefinement();
                      }}
                    >
                      <Sparkles
                        className="ms-1 size-3.5 shrink-0 text-[var(--md-subtle)]"
                        strokeWidth={1.5}
                        aria-hidden="true"
                      />
                      <input
                        ref={refinementInputRef}
                        value={refinementInstruction}
                        onChange={(event) =>
                          setRefinementInstruction(
                            event.target.value.slice(0, 800),
                          )
                        }
                        onKeyDown={(event) => {
                          if (event.key === "Escape") {
                            event.preventDefault();
                            closeRefinement();
                          }
                          if (
                            event.key === "Enter" &&
                            (event.metaKey || event.ctrlKey)
                          ) {
                            event.preventDefault();
                            submitRefinement();
                          }
                        }}
                        disabled={isRefining}
                        aria-label={t("Ask Dexter to refine the selected text")}
                        aria-invalid={Boolean(refinementError)}
                        aria-describedby={`${activeDraftId}-status`}
                        placeholder={t("How should this selection change?")}
                        className="h-full min-w-0 flex-1 bg-transparent text-[16px] text-[var(--md-ink)] outline-none placeholder:text-[color-mix(in_srgb,var(--md-text)_70%,transparent)] disabled:opacity-70 sm:text-[13px]"
                      />
                      <button
                        type="button"
                        disabled={isRefining}
                        aria-label={t("Close refinement")}
                        title={t("Close refinement")}
                        onClick={closeRefinement}
                        className="grid size-8 shrink-0 place-items-center rounded-[var(--md-radius-md)] text-[var(--md-subtle)] transition-colors hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a20)] disabled:opacity-40 motion-reduce:transition-none"
                      >
                        <X
                          className="size-3.5"
                          strokeWidth={1.6}
                          aria-hidden="true"
                        />
                      </button>
                      <DexterRefineSubmit
                        disabled={isRefining}
                        isRefining={isRefining}
                        label={t("Refine selected text")}
                        shouldReduceMotion={shouldReduceMotion}
                      />
                    </motion.form>
                  ) : (
                    <motion.div
                      key="selection-actions"
                      className="flex items-center gap-0.5"
                      initial={
                        shouldReduceMotion
                          ? { opacity: 0 }
                          : { opacity: 0, filter: "blur(3px)" }
                      }
                      animate={{ opacity: 1, filter: "blur(0px)" }}
                      exit={
                        shouldReduceMotion
                          ? { opacity: 0 }
                          : { opacity: 0, filter: "blur(3px)" }
                      }
                      transition={{ duration: shouldReduceMotion ? 0 : 0.14 }}
                    >
                      <button
                        type="button"
                        onClick={() => void openRefinement(bodySelection)}
                        className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[12px] font-medium transition-colors hover:bg-[var(--md-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a20)] motion-reduce:transition-none"
                      >
                        <Sparkles
                          className="size-3.5"
                          strokeWidth={1.5}
                          aria-hidden="true"
                        />
                        {t("Ask for changes")}
                      </button>
                      <span
                        aria-hidden="true"
                        className="mx-0.5 h-5 w-px bg-[color-mix(in_srgb,var(--md-ink)_8%,transparent)]"
                      />
                      <button
                        type="button"
                        aria-label={t("Make shorter")}
                        title={t("Make shorter")}
                        disabled={isRefining}
                        onClick={() =>
                          void performRefinement(
                            "Make the selected text shorter without losing any facts or meaning.",
                            bodySelection,
                          )
                        }
                        className="grid size-8 place-items-center rounded-full transition-colors hover:bg-[var(--md-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a20)] disabled:opacity-40 motion-reduce:transition-none"
                      >
                        <Scissors
                          className="size-3.5"
                          strokeWidth={1.5}
                          aria-hidden="true"
                        />
                      </button>
                      <button
                        type="button"
                        aria-label={t("Make clearer")}
                        title={t("Make clearer")}
                        disabled={isRefining}
                        onClick={() =>
                          void performRefinement(
                            "Make the selected text clearer and more direct without changing its facts or meaning.",
                            bodySelection,
                          )
                        }
                        className="grid size-8 place-items-center rounded-full transition-colors hover:bg-[var(--md-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a20)] disabled:opacity-40 motion-reduce:transition-none"
                      >
                        <WandSparkles
                          className="size-3.5"
                          strokeWidth={1.5}
                          aria-hidden="true"
                        />
                      </button>
                      <button
                        type="button"
                        aria-label={t("Change tone")}
                        title={t("Change tone")}
                        disabled={isRefining}
                        onClick={() =>
                          void openRefinement(bodySelection, "Make this sound ")
                        }
                        className="grid size-8 place-items-center rounded-full transition-colors hover:bg-[var(--md-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a20)] disabled:opacity-40 motion-reduce:transition-none"
                      >
                        <Type
                          className="size-3.5"
                          strokeWidth={1.5}
                          aria-hidden="true"
                        />
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ) : null}
          </AnimatePresence>
          <AnimatePresence initial={false}>
            {replacementTransition ? (
              <motion.span
                key={replacementTransition.id}
                aria-hidden="true"
                style={{
                  top: replacementTransition.top,
                  height: replacementTransition.height,
                }}
                className="pointer-events-none absolute inset-x-0 z-10 rounded-[var(--md-radius-sm)] bg-[color-mix(in_srgb,var(--md-surface)_94%,transparent)]"
                initial={{ opacity: 0.96, filter: "blur(7px)" }}
                animate={{
                  opacity: [0.96, 0.78, 0],
                  filter: ["blur(7px)", "blur(3px)", "blur(0px)"],
                }}
                exit={{ opacity: 0 }}
                transition={{
                  duration: 0.34,
                  times: [0, 0.42, 1],
                  ease: [0.22, 1, 0.36, 1],
                }}
                onAnimationComplete={() => {
                  setReplacementTransition((current) =>
                    current?.id === replacementTransition.id ? null : current,
                  );
                }}
              />
            ) : null}
          </AnimatePresence>
          <Textarea
            ref={bodyEditorRef}
            id={`${activeDraftId}-body`}
            dir="auto"
            data-i18n-skip
            value={bodyText}
            disabled={locked}
            style={{
              background: "transparent",
              borderColor: "transparent",
              boxShadow: "none",
            }}
            aria-invalid={invalidField === "body"}
            aria-describedby={`${activeDraftId}-status`}
            placeholder={t("Write your message")}
            onChange={(event) => {
              setBodyText(event.target.value);
              setBodySelection(null);
              setSelectionAnchor(null);
            }}
            onSelect={updateBodySelection}
            onKeyUp={updateBodySelection}
            onMouseUp={updateBodySelection}
            onScroll={updateBodySelection}
            className="min-h-[220px] resize-y rounded-[var(--md-radius-sm)] border-0 bg-transparent p-0 text-[16px] leading-[1.65] shadow-none outline-none transition-colors focus-visible:bg-[color-mix(in_srgb,var(--md-accent)_5%,transparent)] focus-visible:outline-none focus-visible:ring-0 sm:text-[14px] motion-reduce:transition-none"
          />
        </div>
      </div>

      <footer className="mx-5 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-[color-mix(in_srgb,var(--md-ink)_7%,transparent)] py-3 sm:mx-6">
        <div className="flex min-h-9 items-center gap-2 text-[12px] text-[var(--md-text)]">
          <Checkbox
            id={`${activeDraftId}-tracking`}
            checked={trackOpens}
            disabled={locked}
            onCheckedChange={(value) => setTrackOpens(value === true)}
          />
          <label
            htmlFor={`${activeDraftId}-tracking`}
            className={cn(
              "flex items-center gap-1.5",
              locked ? "cursor-not-allowed opacity-60" : "cursor-pointer",
            )}
          >
            <Eye
              className="size-3.5 text-[var(--md-subtle)]"
              strokeWidth={1.5}
              aria-hidden="true"
            />
            {t("Track opens")}
          </label>
        </div>

        <p
          id={`${activeDraftId}-status`}
          role={statusIsError ? "alert" : "status"}
          aria-live="polite"
          className={cn(
            "min-w-[220px] flex-1 text-pretty text-[12px] leading-5",
            statusIsError ? "text-[var(--md-red)]" : "text-[var(--md-subtle)]",
          )}
        >
          {statusIsError ? (
            <AlertCircle
              className="me-1 inline size-3.5 align-[-2px]"
              strokeWidth={1.6}
              aria-hidden="true"
            />
          ) : null}
          <AnimatePresence initial={false} mode="popLayout">
            <motion.span
              key={visibleStatusText}
              initial={
                shouldReduceMotion
                  ? { opacity: 0 }
                  : { opacity: 0, y: 2, filter: "blur(4px)" }
              }
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={
                shouldReduceMotion
                  ? { opacity: 0 }
                  : { opacity: 0, y: -2, filter: "blur(3px)" }
              }
              transition={{
                duration: shouldReduceMotion ? 0.08 : 0.18,
                ease: "easeOut",
              }}
            >
              {visibleStatusText}
            </motion.span>
          </AnimatePresence>
        </p>
      </footer>
    </section>
  );
}
