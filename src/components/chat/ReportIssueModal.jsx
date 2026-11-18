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
  `rounded-md border-2 border-ink px-3 py-2 text-left text-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-purple ${
    active ? "bg-primary text-white" : "bg-white hover:bg-primary-tint"
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
    <Modal open={open} onClose={close} title="Report an issue" maxWidth="max-w-2xl">
      <form className="grid gap-5" onSubmit={submit} noValidate>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-2 border-purple/30 bg-peach p-3 text-sm">
          <p className="font-extrabold">{brandName || "Selected brand"}</p>
          <span className="text-xs text-muted">Agent: {agentName}</span>
          <span className="text-xs text-muted">Session {String(sessionId || "").slice(-8)}</span>
        </div>

        {targetMessage && (
          <div className="grid gap-2 border-2 border-ink/20 bg-white p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-extrabold uppercase tracking-wider text-purple">Reply you're reporting</p>
              <button
                type="button"
                onClick={onClearTarget}
                className="text-xs font-bold text-muted underline-offset-2 hover:text-ink hover:underline"
              >
                Report the whole chat instead
              </button>
            </div>
            <p className="line-clamp-3 whitespace-pre-wrap text-sm text-slate-700">{targetMessage.text}</p>
          </div>
        )}

        <fieldset className="grid gap-2" disabled={sending}>
          <legend className="text-sm font-bold">
            What went wrong? <span className="text-red-700" aria-hidden="true">*</span>
          </legend>
          <div role="radiogroup" aria-label="Issue category" className="grid gap-2 sm:grid-cols-2">
            {ISSUE_CATEGORIES.map((item) => (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={category === item.id}
                aria-label={`${item.label}. ${item.hint}`}
                onClick={() => setCategory(item.id)}
                className={choiceClass(category === item.id)}
              >
                <span className="block text-sm font-extrabold">{item.label}</span>
                <span className={`block text-xs font-medium ${category === item.id ? "text-white/80" : "text-muted"}`}>
                  {item.hint}
                </span>
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="grid gap-2" disabled={sending}>
          <legend className="text-sm font-bold">How serious is it?</legend>
          <div role="radiogroup" aria-label="Severity" className="grid grid-cols-3 gap-2">
            {SEVERITIES.map((item) => (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={severity === item.id}
                onClick={() => setSeverity(item.id)}
                className={`${choiceClass(severity === item.id)} text-center font-extrabold`}
              >
                {item.label}
              </button>
            ))}
          </div>
          {severity === "high" && (
            <p className="text-xs text-muted">High severity is flagged more prominently for the team in Slack.</p>
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
          <p className="text-sm font-bold">
            Notify teammates <span className="font-medium text-muted">(optional)</span>
          </p>
          <TeammatePicker brandId={brandId} active={open} value={tagged} onChange={setTagged} disabled={sending} variant="modal" />
        </section>

        <section className="border-2 border-ink/20 bg-white" aria-label="Attached conversation">
          <button
            type="button"
            onClick={() => setShowTranscript((value) => !value)}
            aria-expanded={showTranscript}
            className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
          >
            <span className="text-sm font-bold">
              Conversation attached
              <span className="ml-2 font-medium text-muted">
                {transcript.length} message{transcript.length === 1 ? "" : "s"}
                {trimmedCount > 0 ? ` (latest ${MAX_MESSAGES} of ${transcript.length + trimmedCount})` : ""}
              </span>
            </span>
            <ChevronDown size={16} className={`shrink-0 transition ${showTranscript ? "rotate-180" : ""}`} />
          </button>
          {showTranscript && (
            <ol className="max-h-56 space-y-2 overflow-y-auto border-t-2 border-ink/10 bg-slate-50 p-3">
              {transcript.map((message) => {
                const flagged = targetMessage?.id === message.id;
                return (
                  <li
                    key={message.id}
                    className={`border-2 bg-white p-2 text-xs ${flagged ? "border-orange" : "border-ink/10"}`}
                  >
                    <p className="mb-0.5 flex items-center gap-2 font-extrabold">
                      {message.role === "user" ? "Tester" : agentName}
                      <span className="font-medium text-muted">{timeLabel(new Date(message.created_at))}</span>
                      {flagged && <span className="ml-auto text-orange">Reported reply</span>}
                    </p>
                    <p className="line-clamp-4 whitespace-pre-wrap text-slate-700">{message.text}</p>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        {/* The footer is pinned, so an error shown inside it is always visible,
            even when the tester has scrolled to the middle of the form. */}
        <div className="sticky bottom-0 grid gap-3 border-t-2 border-ink/10 bg-white pt-4">
          {error && (
            <p role="alert" className="border-2 border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
              {error}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-xs text-xs text-muted">
              The full conversation and session ID are saved with this report and shared with the team on Slack.
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={close} disabled={sending}>
                Cancel
              </Button>
              <Button type="submit" variant="purple" disabled={sending}>
                {sending ? <Loader2 size={16} className="animate-spin" /> : <Flag size={16} />}
                {sending ? "Sending…" : "Send to team"}
              </Button>
            </div>
          </div>
        </div>
      </form>
    </Modal>
  );
}
