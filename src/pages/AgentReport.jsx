import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Flag, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import Button from "../components/ui/Button";
import { issueCategoryLabel } from "../components/chat/ReportIssueModal";
import ChatMessageText from "../components/chat/ChatMessageText";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import {
  getBrandAgentFeedbackReport,
  resendBrandAgentFeedbackToSlack,
  updateBrandAgentFeedback,
} from "../services/orbApi";

const SEVERITY = {
  low: "bg-emerald-100 text-emerald-800",
  medium: "bg-amber-100 text-amber-800",
  high: "bg-red-100 text-red-700",
};
const SLACK = {
  sent: { label: "Sent to Slack", className: "bg-emerald-100 text-emerald-800" },
  pending: { label: "Sending to Slack…", className: "bg-amber-100 text-amber-800" },
  failed: { label: "Slack delivery failed", className: "bg-red-100 text-red-700" },
};

const when = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
};

function Chip({ className = "", children }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wide ${className}`}>
      {children}
    </span>
  );
}

function Section({ title, children }) {
  return (
    <section className="border-2 border-ink/15 bg-white p-4">
      <h3 className="text-xs font-extrabold uppercase tracking-widest text-purple">{title}</h3>
      <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-800">{children}</div>
    </section>
  );
}

export default function AgentReport() {
  const { brandId, feedbackId } = useParams();
  const { user, isAdmin } = useAuth();
  const { showToast } = useToast();
  const [state, setState] = useState({ status: "loading", report: null, snapshot: null, error: "" });
  const [busy, setBusy] = useState("");
  const reportedRef = useRef(null);

  const load = useCallback(
    async (quiet = false) => {
      if (!quiet) setState((current) => ({ ...current, status: "loading", error: "" }));
      try {
        const result = await getBrandAgentFeedbackReport(brandId, feedbackId);
        if (!result?.feedback) throw new Error("Orb API is unavailable.");
        setState({ status: "ready", report: result.feedback, snapshot: result.snapshot, error: "" });
      } catch (cause) {
        // A report you may not read looks the same as one that does not exist.
        const missing = /not found/i.test(cause?.message || "");
        setState({
          status: missing ? "missing" : "error",
          report: null,
          snapshot: null,
          error: cause?.message || "Could not load this report.",
        });
      }
    },
    [brandId, feedbackId],
  );

  useEffect(() => {
    load();
  }, [load]);

  // While Slack delivery is still running, refresh in the background for a short while.
  const delivery = state.report?.slack_delivery_status;
  useEffect(() => {
    if (delivery !== "pending") return undefined;
    let tries = 0;
    const timer = window.setInterval(() => {
      tries += 1;
      if (tries > 8) return window.clearInterval(timer);
      load(true);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [delivery, load]);

  useEffect(() => {
    if (state.status === "ready") reportedRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [state.status]);

  const resend = async () => {
    setBusy("resend");
    try {
      const result = await resendBrandAgentFeedbackToSlack(brandId, feedbackId);
      setState((current) => ({ ...current, report: { ...current.report, ...result.feedback } }));
      showToast("Sending to Slack again…");
    } catch (cause) {
      showToast(cause?.message || "Could not resend to Slack.", "error");
    } finally {
      setBusy("");
    }
  };

  const toggleResolved = async () => {
    const next = state.report.status === "resolved" ? "open" : "resolved";
    setBusy("status");
    try {
      const result = await updateBrandAgentFeedback(brandId, feedbackId, { status: next });
      setState((current) => ({ ...current, report: { ...current.report, ...result.feedback } }));
    } catch (cause) {
      showToast(cause?.message || "Could not update the report.", "error");
    } finally {
      setBusy("");
    }
  };

  // One list for everyone: feedback and issue reports are the same page.
  const back = (
    <Link to="/app/feedback" className="inline-flex items-center gap-1.5 text-sm font-bold text-muted hover:text-ink">
      <ArrowLeft size={15} /> Feedback & issues
    </Link>
  );

  if (state.status === "loading")
    return (
      <div className="mx-auto max-w-4xl">
        {back}
        <p className="mt-6 flex items-center gap-2 text-sm text-muted" role="status">
          <Loader2 size={16} className="animate-spin" /> Loading report…
        </p>
      </div>
    );

  if (state.status !== "ready")
    return (
      <div className="mx-auto max-w-4xl">
        {back}
        <div className="mt-6 border-2 border-ink bg-white p-6" role="alert">
          <h2 className="text-xl font-extrabold">
            {state.status === "missing" ? "Report not found" : "Could not load this report"}
          </h2>
          <p className="mt-2 text-sm text-muted">
            {state.status === "missing"
              ? `This report doesn't exist, or you don't have access to it${user?.email ? ` as ${user.email}` : ""}. Reports are visible to admins and to members of the brand they were filed for.`
              : state.error}
          </p>
          {state.status === "error" && (
            <Button className="mt-4" variant="outline" size="sm" onClick={() => load()}>
              <RefreshCw size={14} /> Try again
            </Button>
          )}
        </div>
      </div>
    );

  const { report, snapshot } = state;
  const meta = report.agent_metadata || {};
  const messages = Array.isArray(snapshot?.messages) ? snapshot.messages : [];
  const agentName = meta.agent_name || "Agent";
  // "Failed" can mean the Slack message went out but the transcript file did not.
  const partialSlack = report.slack_delivery_status === "failed" && report.slack_message_posted;
  const slackState = partialSlack
    ? { label: "Sent to Slack · transcript file missing", className: "bg-amber-100 text-amber-800" }
    : SLACK[report.slack_delivery_status];
  const resolved = report.status === "resolved";
  // A report with no category is a note the tester chose to send to the team.
  const isNote = !report.category;

  return (
    <div className="mx-auto max-w-4xl pb-10">
      {back}
      <header className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-widest text-purple">
            <Flag size={13} /> {isNote ? "Agent feedback note" : "Agent issue report"}
          </p>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight">
            {isNote ? "Feedback note" : issueCategoryLabel(report.category) || "Issue report"}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {report.severity && <Chip className={SEVERITY[report.severity] || "bg-slate-100 text-slate-700"}>{report.severity} severity</Chip>}
            <Chip className={resolved ? "bg-emerald-100 text-emerald-800" : "bg-primary-tint text-primary"}>
              {String(report.status || "open").replaceAll("_", " ")}
            </Chip>
            {slackState && <Chip className={slackState.className}>{slackState.label}</Chip>}
          </div>
        </div>
        {isAdmin && (
          <div className="flex flex-wrap gap-2">
            {(report.slack_delivery_status === "failed" || report.slack_delivery_status === "pending") && (
              <Button variant="outline" size="sm" onClick={resend} disabled={Boolean(busy)}>
                {busy === "resend" ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} {partialSlack ? "Retry transcript upload" : "Resend to Slack"}
              </Button>
            )}
            <Button variant={resolved ? "outline" : "purple"} size="sm" onClick={toggleResolved} disabled={Boolean(busy)}>
              {busy === "status" ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              {resolved ? "Reopen" : "Mark resolved"}
            </Button>
          </div>
        )}
      </header>

      {isAdmin && report.slack_delivery_status === "failed" && report.slack_last_error && (
        <p className="mt-4 border-2 border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700" role="alert">
          Slack error (attempt {report.slack_attempts || 1}): {report.slack_last_error}
        </p>
      )}

      <dl className="mt-5 grid gap-x-6 gap-y-2 border-2 border-purple/30 bg-peach p-4 text-sm sm:grid-cols-2">
        {[
          ["Brand", meta.brand_name],
          ["Agent", meta.agent_name],
          [
            "Reported by",
            report.submitted_by_name
              ? `${report.submitted_by_name}${report.submitted_by_email ? ` (${report.submitted_by_email})` : ""}`
              : (report.submitted_by_email || ""),
          ],
          ["Reported", when(report.created_at)],
          ["Session", report.session_id],
          ["Environment", meta.environment],
        ]
          .filter(([, value]) => value)
          .map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-xs font-extrabold uppercase tracking-wider text-muted">{label}</dt>
              <dd className="truncate font-bold" title={String(value)}>{value}</dd>
            </div>
          ))}
        {report.tagged_people?.length > 0 && (
          <div className="sm:col-span-2">
            <dt className="text-xs font-extrabold uppercase tracking-wider text-muted">Tagged</dt>
            <dd className="mt-1 flex flex-wrap gap-1.5">
              {report.tagged_people.map((person) => (
                <span key={person.id} className="rounded-full border-2 border-ink bg-white px-2.5 py-0.5 text-xs font-bold">@{person.name}</span>
              ))}
            </dd>
          </div>
        )}
      </dl>

      <div className={`mt-5 grid gap-4 ${isNote ? "" : "md:grid-cols-2"}`}>
        <Section title={isNote ? "Note" : "What happened"}>{report.note || "—"}</Section>
        {!isNote && <Section title="Expected behaviour">{report.ideal_reply || "Not provided."}</Section>}
      </div>

      <section className="mt-6" aria-label="Conversation">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="text-xl font-extrabold">Conversation</h2>
          {snapshot && (
            <p className="flex items-center gap-1.5 text-xs text-muted">
              <ShieldCheck size={14} /> Saved copy of {snapshot.message_count} message{snapshot.message_count === 1 ? "" : "s"}
              {snapshot.truncated ? " (latest only)" : ""} · cannot be edited · {String(snapshot.sha256 || "").slice(0, 8)}
            </p>
          )}
        </div>
        {!messages.length ? (
          <p className="mt-3 border-2 border-dashed border-ink/25 bg-white p-5 text-sm text-muted">
            The conversation for this report isn't available. It may still be saving. Refresh in a moment.
          </p>
        ) : (
          <ol className="mt-3 space-y-3 border-2 border-ink/15 bg-[#f8f9fb] p-4 sm:p-5">
            {messages.map((message) => {
              const fromTester = message.role === "user";
              const flagged = report.message_id && message.id === report.message_id;
              return (
                <li key={message.id} ref={flagged ? reportedRef : undefined} className={`flex ${fromTester ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[85%] px-4 py-3 text-[15px] leading-6 shadow-sm sm:max-w-[72%] ${
                      fromTester ? "rounded-2xl rounded-br-sm bg-primary text-white" : "rounded-2xl rounded-bl-sm border border-slate-200 bg-white text-slate-700"
                    } ${flagged ? "ring-4 ring-orange" : ""}`}
                  >
                    <p className={`mb-1 flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-wide ${fromTester ? "text-white/75" : "text-slate-400"}`}>
                      {fromTester ? "Tester" : agentName}
                      <span className="font-medium normal-case tracking-normal">{when(message.created_at)}</span>
                      {flagged && <span className="rounded bg-orange px-1.5 py-0.5 text-ink">Reported reply</span>}
                    </p>
                    <ChatMessageText text={message.text} isUser={fromTester} />
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}
