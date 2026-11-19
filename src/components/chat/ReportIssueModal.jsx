import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Flag, Loader2 } from "lucide-react";
import Button from "../ui/Button";
import Modal from "../ui/Modal";
import Textarea from "../ui/Textarea";
import TeammatePicker from "./TeammatePicker";
import { useToast } from "../../context/ToastContext";
import { reportBrandAgentIssue } from "../../services/orbApi";
import { MAX_MESSAGES, buildTranscript, newIdempotencyKey } from "../../lib/transcript";

// The ids are the contract with the backend (`category` column check). Keep the
// two in sync when a category is added.
export const ISSUE_CATEGORIES = [
  { id: "incorrect_response", label: "Incorrect response", hint: "The answer was wrong or off-topic." },
  { id: "hallucination", label: "Hallucination", hint: "Made-up details, policies or links." },
  { id: "context_loss", label: "Context loss", hint: "Forgot or ignored earlier messages." },
  { id: "rag_retrieval_failure", label: "Knowledge retrieval", hint: "Missed the right SOP, FAQ or product info." },
  { id: "tool_execution_failure", label: "Tool failure", hint: "A lookup or action failed or returned nothing." },
  { id: "incorrect_behavior", label: "Wrong behaviour", hint: "Tone, escalation or policy handling was off." },
  { id: "other", label: "Other", hint: "Something that doesn't fit above." },
];
export const issueCategoryLabel = (id) =>
  ISSUE_CATEGORIES.find((category) => category.id === id)?.label || "";

const SEVERITIES = [
  { id: "low", label: "Low" },
  { id: "medium", label: "Medium" },
  { id: "high", label: "High" },
];

const MIN_DESCRIPTION = 10;
const MAX_TEXT = 5000;

const timeLabel = (date) =>
  new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);

const choiceClass = (active) =>
  `group relative rounded-xl border p-3 text-left transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 ${
    active
      ? "border-primary bg-primary text-white shadow-sm ring-1 ring-primary"
      : "border-line bg-white text-ink hover:border-primary/40 hover:bg-subtle/50"
  }`;

export default function ReportIssueModal({
  open,
  onClose,
  brandId,
  brandName,
  agentName,
  sessionId,
  messages,
  targetMessage,
  onClearTarget,
  onSubmitted,
}) {
  const { showToast } = useToast();
  const [category, setCategory] = useState("");
  const [severity, setSeverity] = useState("medium");
  const [description, setDescription] = useState("");
  const [expected, setExpected] = useState("");
  const [tagged, setTagged] = useState([]);
  const [showTranscript, setShowTranscript] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const idempotencyKey = useRef(newIdempotencyKey());

  // Start every report from a clean form and a fresh idempotency key. A key is
  // only reused while the same form is open, so a double click cannot create
  // two reports but a second, separate report can.
  useEffect(() => {
    if (!open) return;
    setCategory("");
    setSeverity("medium");
    setDescription("");
    setExpected("");
    setTagged([]);
    setShowTranscript(false);
    setSending(false);
    setError("");
    idempotencyKey.current = newIdempotencyKey();
  }, [open]);

  const transcript = useMemo(() => buildTranscript(messages), [messages]);
  const trimmedCount = Math.max(0, (messages || []).length - transcript.length);

  const close = () => {
    if (!sending) onClose();
  };

  const submit = async (event) => {
    event.preventDefault();
    if (sending) return;
    if (!category) return setError("Choose what went wrong.");
    if (description.trim().length < MIN_DESCRIPTION)
      return setError(`Describe the problem in at least ${MIN_DESCRIPTION} characters.`);
    if (!transcript.length) return setError("There is no conversation to attach yet.");
    setSending(true);
    setError("");
    try {
      const result = await reportBrandAgentIssue(
        brandId,
        {
          session_id: sessionId,
          category,
          severity,
          description: description.trim(),
          expected_behavior: expected.trim(),
          message_id: targetMessage?.id || "",
          tagged_people: tagged,
          transcript,
          // Lets the server flag a transcript that was trimmed to the latest messages.
          total_message_count: (messages || []).length,
        },
        idempotencyKey.current,
      );
      const delivery = result?.feedback?.slack_delivery_status;
      showToast(
        delivery === "failed"
          ? "Report saved. Slack delivery failed, so the team can resend it."
          : "Issue reported. The team has been notified.",
      );
      onSubmitted?.(result?.feedback || null);
      onClose();
    } catch (cause) {
      setError(cause?.message || "Could not send the report. Try again.");
      setSending(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Report an issue"
      maxWidth="max-w-2xl"
      footer={
        <div>
          {error && (
            <p role="alert" className="mb-3 rounded-lg border border-danger/25 bg-danger-tint px-3 py-2 text-xs font-medium text-danger">
              {error}
            </p>
          )}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-fg-muted leading-relaxed">
              The conversation and session details will be saved with this report.
            </p>
            <div className="flex shrink-0 items-center justify-end gap-2.5">
              <Button type="button" variant="secondary" size="sm" onClick={close} disabled={sending}>
                Cancel
              </Button>
              <Button form="report-issue-form" type="submit" variant="primary" size="sm" disabled={sending}>
                {sending ? <Loader2 size={14} className="animate-spin" /> : <Flag size={14} />}
                {sending ? "Sending…" : "Send to team"}
              </Button>
            </div>
          </div>
        </div>
      }
    >
      <form id="report-issue-form" className="grid gap-4" onSubmit={submit} noValidate>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-canvas p-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-xs font-semibold text-primary">
              {(brandName || "Brand").charAt(0).toUpperCase()}
            </div>
            <span className="text-sm font-semibold text-ink">{brandName || "Selected brand"}</span>
            <span className="text-xs text-fg-muted">·</span>
            <span className="text-xs text-fg-muted">Agent: <strong className="font-medium text-ink">{agentName}</strong></span>
          </div>
          <span className="rounded-md bg-subtle px-2 py-0.5 text-[11px] font-mono text-fg-muted">
            Session {String(sessionId || "").slice(-8)}
          </span>
        </div>

        {targetMessage && (
          <div className="grid gap-1.5 rounded-xl border border-primary/25 bg-primary-tint/30 p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">Reported AI Reply</p>
              <button
                type="button"
                onClick={onClearTarget}
                className="text-xs font-medium text-fg-muted underline-offset-2 hover:text-ink hover:underline"
              >
                Report whole chat instead
              </button>
            </div>
            <p className="line-clamp-3 whitespace-pre-wrap text-xs leading-5 text-ink/80">{targetMessage.text}</p>
          </div>
        )}

        <fieldset className="grid gap-2" disabled={sending}>
          <legend className="text-xs font-semibold text-ink">
            What went wrong? <span className="text-danger" aria-hidden="true">*</span>
          </legend>
          <div role="radiogroup" aria-label="Issue category" className="grid gap-2 sm:grid-cols-2">
            {ISSUE_CATEGORIES.map((item) => {
              const active = category === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  aria-label={`${item.label}. ${item.hint}`}
                  onClick={() => setCategory(item.id)}
                  className={choiceClass(active)}
                >
                  <span className={`block text-xs font-semibold ${active ? "text-white" : "text-ink"}`}>{item.label}</span>
                  <span className={`mt-0.5 block text-[11px] leading-4 ${active ? "text-white/80" : "text-fg-muted"}`}>
                    {item.hint}
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="grid gap-2" disabled={sending}>
          <legend className="text-xs font-semibold text-ink">How serious is it?</legend>
          <div role="radiogroup" aria-label="Severity" className="grid grid-cols-3 gap-2 rounded-xl border border-line bg-subtle/50 p-1">
            {SEVERITIES.map((item) => {
              const active = severity === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setSeverity(item.id)}
                  className={`rounded-lg py-1.5 text-center text-xs font-semibold transition-all duration-150 ${
                    active
                      ? "bg-white text-ink shadow-sm ring-1 ring-black/5"
                      : "text-fg-muted hover:text-ink"
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
          {severity === "high" && (
            <p className="text-xs text-warning">High severity is flagged for immediate review.</p>
          )}
        </fieldset>

        <Textarea
          label="What happened?"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Describe the problem, e.g. what the agent said and why it's wrong…"
          maxLength={MAX_TEXT}
          disabled={sending}
          required
        />
        <Textarea
          label="What should the AI have done? (optional)"
          value={expected}
          onChange={(event) => setExpected(event.target.value)}
          placeholder="The correct answer or behaviour you expected…"
          maxLength={MAX_TEXT}
          className="[&_textarea]:min-h-20"
          disabled={sending}
        />

        <section className="grid gap-2" aria-label="Notify teammates">
          <p className="text-xs font-semibold text-ink">
            Notify teammates <span className="font-normal text-fg-muted">(optional)</span>
          </p>
          <TeammatePicker brandId={brandId} active={open} value={tagged} onChange={setTagged} disabled={sending} variant="modal" />
        </section>

        <section className="rounded-xl border border-line bg-white overflow-hidden" aria-label="Attached conversation">
          <button
            type="button"
            onClick={() => setShowTranscript((value) => !value)}
            aria-expanded={showTranscript}
            className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left transition hover:bg-subtle/40"
          >
            <span className="text-xs font-semibold text-ink">
              Conversation attached
              <span className="ml-2 font-normal text-fg-muted">
                {transcript.length} message{transcript.length === 1 ? "" : "s"}
                {trimmedCount > 0 ? ` (latest ${MAX_MESSAGES} of ${transcript.length + trimmedCount})` : ""}
              </span>
            </span>
            <ChevronDown size={15} className={`shrink-0 text-fg-muted transition-transform duration-200 ${showTranscript ? "rotate-180" : ""}`} />
          </button>
          {showTranscript && (
            <ol className="max-h-48 space-y-2 overflow-y-auto thin-scroll border-t border-line bg-subtle/30 p-3">
              {transcript.map((message) => {
                const flagged = targetMessage?.id === message.id;
                return (
                  <li
                    key={message.id}
                    className={`rounded-lg border p-2 text-xs transition ${flagged ? "border-primary bg-primary-tint/20 ring-1 ring-primary/30" : "border-line bg-white"}`}
                  >
                    <p className="mb-0.5 flex items-center gap-2 font-semibold text-ink">
                      {message.role === "user" ? "You" : agentName}
                      <span className="font-normal text-fg-muted">{timeLabel(new Date(message.created_at))}</span>
                      {flagged && <span className="ml-auto text-[11px] font-medium text-primary">Reported reply</span>}
                    </p>
                    <p className="line-clamp-4 whitespace-pre-wrap text-ink/80">{message.text}</p>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </form>
    </Modal>
  );
}
