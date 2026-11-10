import React, { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  Eraser,
  Loader2,
  Maximize2,
  MessageCircleMore,
  Minimize2,
  ThumbsUp,
  X,
} from "lucide-react";
import Orb from "../components/Orb";
import { listBrands } from "../services/brands";
import {
  chatWithBrandAgent,
  clearBrandChatHistory,
  createBrandAgentFeedback,
  getBrandChatHistory,
  hasBrandAgentApi,
  hasOrbApi,
  listBrandAgentFeedback,
} from "../services/orbApi";
import useAsync from "../hooks/useAsync";
import { useToast } from "../context/ToastContext";
import { useAuth } from "../context/AuthContext";

const prompts = [
  "What is your return policy?",
  "Can you help me track my order?",
  "Do you have this product in stock?",
];
const feedbackTags = ["Wrong info", "Tone", "Too long", "Missing SOP", "Should escalate"];

const newSessionId = () => {
  if (typeof crypto !== "undefined" && crypto.randomUUID)
    return crypto.randomUUID();
  return `orb-chat-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

// The deployed support-agent API accepts session IDs of at most 64 URL-safe
// characters. A browser-session UUID is stable for the active test session
// and avoids combining two UUIDs into an invalid 77-character value.
const sessionForBrand = () => `orb_${newSessionId().replace(/-/g, "")}`;

const historyText = (message) =>
  typeof message === "string"
    ? message.trim()
    : String(
        message?.content ||
          message?.message ||
          message?.text ||
          message?.response ||
          message?.reply ||
          "",
      ).trim();

const historyRole = (message) => {
  const role = String(message?.role || message?.sender || "").toLowerCase();
  return role === "user" || role === "customer" || role === "human"
    ? "user"
    : "agent";
};

const historyDate = (message) => {
  const parsed = new Date(
    message?.created_at ||
      message?.createdAt ||
      message?.timestamp ||
      Date.now(),
  );
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};

const timeLabel = (createdAt) =>
  new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(createdAt);

function AgentOrb({ className = "" }) {
  return (
    <span
      className={`block shrink-0 overflow-hidden rounded-full ${className}`}
      aria-hidden="true"
    >
      <Orb
        colors={["#9c43fe", "#4cc2e9", "#101499"]}
        backgroundColor="#ffffff"
        size={0.92}
        glow={1}
        hoverIntensity={1}
        trail={1}
        rotateOnHover
        followCursor
        intro
      />
    </span>
  );
}

export default function AgentChat({ embedded = false }) {
  const { data: brandData, loading: brandsLoading } = useAsync(listBrands, []);
  const { user } = useAuth();
  const { showToast } = useToast();
  const brands = Array.isArray(brandData) ? brandData : [];
  const [brandId, setBrandId] = useState(
    () => localStorage.getItem("orb_selected_brand") || "",
  );
  const [sessionId, setSessionId] = useState(newSessionId);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [agentNameOverride, setAgentNameOverride] = useState(null);
  const [feedback, setFeedback] = useState([]);
  const [feedbackTarget, setFeedbackTarget] = useState(null);
  const [selectedTags, setSelectedTags] = useState([]);
  const [feedbackNote, setFeedbackNote] = useState("");
  const [idealReply, setIdealReply] = useState("");
  const [overallNote, setOverallNote] = useState("");
  const [savingFeedback, setSavingFeedback] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const messagesRef = useRef(null);
  const activeBrand = brands.find((brand) => brand.id === brandId) || brands[0];
  const configuredAgentName = String(activeBrand?.ai_agent_name || "").trim();
  const agentName = agentNameOverride || configuredAgentName || "AI";
  const title = `Chat with ${agentName}`;

  useEffect(() => {
    if (activeBrand?.id && activeBrand.id !== brandId)
      setBrandId(activeBrand.id);
  }, [activeBrand?.id, brandId]);

  useEffect(() => {
    setAgentNameOverride(null);
  }, [activeBrand?.id]);

  useEffect(() => {
    if (!activeBrand?.id) return;
    setSessionId(sessionForBrand());
  }, [activeBrand?.id, user?.id]);

  useEffect(() => {
    let live = true;
    if (!activeBrand?.id || !sessionId || !hasBrandAgentApi) return undefined;
    getBrandChatHistory(activeBrand.id, sessionId)
      .then((result) => {
        if (!live) return;
        const history = Array.isArray(result?.messages)
          ? result.messages
          : Array.isArray(result?.history)
            ? result.history
            : [];
        const restored = history
          .map((message, index) => ({
            id: message?.id || `history-${index}`,
            role: historyRole(message),
            text: historyText(message),
            createdAt: historyDate(message),
          }))
          .filter((message) => message.text);
        setMessages(restored);
      })
      .catch(() => {
        if (live) setMessages([]);
      });
    return () => {
      live = false;
    };
  }, [activeBrand?.id, sessionId]);

  useEffect(() => {
    let live = true;
    if (!activeBrand?.id || !sessionId || !hasOrbApi) {
      setFeedback([]);
      return undefined;
    }
    listBrandAgentFeedback(activeBrand.id, sessionId)
      .then((result) => { if (live) setFeedback(Array.isArray(result?.feedback) ? result.feedback : []); })
      .catch(() => { if (live) setFeedback([]); });
    return () => { live = false; };
  }, [activeBrand?.id, sessionId]);

  useEffect(() => {
    const onBrandChange = (event) => {
      if (event.detail?.id) {
        setBrandId(event.detail.id);
        if (typeof event.detail.ai_agent_name === "string") {
          setAgentNameOverride(event.detail.ai_agent_name.trim());
        }
        setMessages([]);
        setFeedback([]);
        setFeedbackTarget(null);
        setError("");
        setSessionId(sessionForBrand());
      }
    };
    window.addEventListener("orb:brand-changed", onBrandChange);
    return () => window.removeEventListener("orb:brand-changed", onBrandChange);
  }, []);

  useEffect(() => {
    messagesRef.current?.scrollTo({
      top: messagesRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, sending]);

  useEffect(() => {
    if (!isFullscreen) return undefined;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setIsFullscreen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [isFullscreen]);

  const clearChat = async () => {
    if (activeBrand?.id && sessionId && hasBrandAgentApi) {
      try {
        await clearBrandChatHistory(activeBrand.id, sessionId);
      } catch (cause) {
        setError(
          cause?.message || "Could not clear the deployed agent conversation.",
        );
        return;
      }
    }
    setMessages([]);
    setFeedback([]);
    setFeedbackTarget(null);
    setDraft("");
    setError("");
    setSessionId(sessionForBrand());
  };

  const sendMessage = async (event, prompt) => {
    event?.preventDefault();
    const message = String(prompt ?? draft).trim();
    if (!message || sending || !activeBrand?.id) return;
    const createdAt = new Date();
    setMessages((items) => [
      ...items,
      { id: `user-${Date.now()}`, role: "user", text: message, createdAt },
    ]);
    setDraft("");
    setError("");
    setSending(true);
    try {
      const result = await chatWithBrandAgent(activeBrand.id, {
        message,
        session_id: sessionId,
      });
      const reply = String(result?.response || result?.reply || "").trim();
      if (!reply) throw new Error("The deployed AI agent returned no reply.");
      setMessages((items) => [
        ...items,
        {
          id: `agent-${Date.now()}`,
          role: "agent",
          text: reply,
          createdAt: new Date(),
        },
      ]);
    } catch (cause) {
      setError(
        cause.message ||
          "The deployed agent could not respond. Try again in a moment.",
      );
    } finally {
      setSending(false);
    }
  };

  const resetReplyFeedback = () => {
    setFeedbackTarget(null);
    setSelectedTags([]);
    setFeedbackNote("");
    setIdealReply("");
  };

  const saveFeedback = async ({ scope, target = null, tags = [], note = "", ideal = "" }) => {
    if (!activeBrand?.id || !sessionId || savingFeedback) return;
    if (!tags.length && !note.trim() && !ideal.trim()) return;
    setSavingFeedback(true);
    try {
      const result = await createBrandAgentFeedback(activeBrand.id, {
        session_id: sessionId,
        scope,
        message_id: target?.id || "",
        agent_reply: target?.text || "",
        tags,
        note: note.trim(),
        ideal_reply: ideal.trim(),
      });
      if (result?.feedback) setFeedback((items) => [...items, result.feedback]);
      if (scope === "reply") resetReplyFeedback();
      else setOverallNote("");
      showToast("Feedback saved for the team.");
    } catch (cause) {
      showToast(cause?.message || "Could not save feedback.", "error");
    } finally {
      setSavingFeedback(false);
    }
  };

  const toggleFeedbackTag = (tag) => setSelectedTags((tags) => tags.includes(tag) ? tags.filter((item) => item !== tag) : [...tags, tag]);

  return (
    <div
      className={`flex flex-col ${isFullscreen ? "fixed inset-0 z-[70] h-[100dvh] min-h-0 max-w-none bg-peach p-4 sm:p-6" : `mx-auto ${embedded ? "h-[calc(100dvh-13rem)] min-h-[42rem] max-w-7xl" : "h-[calc(100dvh-8rem)] min-h-[42rem] max-w-6xl"}`}`}
      role={isFullscreen ? "dialog" : undefined}
      aria-modal={isFullscreen || undefined}
      aria-label={isFullscreen ? `${title} full screen` : undefined}
    >
      <div className={`flex flex-wrap items-end justify-between gap-3 ${isFullscreen ? "mb-4" : "mb-5"}`}>
        <div>
          <p className="text-xs font-extrabold uppercase tracking-widest text-primary">
            Agent tester
          </p>
          <h2 className="mt-1 text-3xl font-extrabold tracking-tight">
            {title}
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            Send a test conversation directly to this brand’s deployed support
            agent.
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsFullscreen((open) => !open)}
            className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition hover:border-primary/35 hover:bg-primary-tint/30 hover:text-primary"
            aria-label={isFullscreen ? "Exit full screen" : "Open chat full screen"}
            title={isFullscreen ? "Exit full screen (Esc)" : "Open chat full screen"}
          >
            {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            <span className="hidden sm:inline">{isFullscreen ? "Exit full screen" : "Full screen"}</span>
          </button>
          <button
            type="button"
            onClick={clearChat}
            disabled={!messages.length && !draft && !error}
            className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Eraser size={15} />
            Clear chat
          </button>
        </div>
      </div>
      <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:flex-row">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col lg:border-r lg:border-slate-200">
          <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-5 py-4 sm:px-6">
            <AgentOrb className="h-10 w-10 shadow-sm" />
            <div className="min-w-0">
              <h3 className="truncate text-sm font-extrabold text-slate-900">
                {agentName}
              </h3>
              <p className="text-xs text-slate-500">Deployed support agent</p>
            </div>
            <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-extrabold text-emerald-700">
              <i className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Test mode
            </span>
          </header>

          <div
            ref={messagesRef}
            className="min-h-0 flex-1 overflow-y-auto bg-[#f8f9fb] p-6 sm:p-7"
          >
            {!messages.length && !sending && (
              <div className="grid min-h-full place-items-center">
                <div className="max-w-md text-center">
                  <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary-tint text-primary">
                    <MessageCircleMore size={28} />
                  </div>
                  <h4 className="mt-4 text-lg font-extrabold text-slate-900">
                    Start a test conversation
                  </h4>
                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    Ask the same questions your customers would ask. The reply
                    comes from {agentName}’s deployed agent.
                  </p>
                  <div className="mt-5 grid gap-2 text-left">
                    {prompts.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={(event) => sendMessage(event, prompt)}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-left text-xs font-medium text-slate-600 transition hover:border-primary/35 hover:bg-primary-tint/30 hover:text-slate-800"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div className="w-full space-y-3">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`chat-message-enter flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[78%] px-4 py-3 text-[15px] leading-6 shadow-sm sm:max-w-[68%] ${message.role === "user" ? "rounded-2xl rounded-br-sm bg-primary text-white" : "rounded-2xl rounded-bl-sm border border-slate-200 bg-white text-slate-700"}`}
                  >
                    <p className="whitespace-pre-wrap">{message.text}</p>
                    <p
                      className={`mt-1 text-[10px] ${message.role === "user" ? "text-white/65" : "text-slate-400"}`}
                    >
                      {timeLabel(message.createdAt)}
                    </p>
                    {message.role === "agent" && <div className="mt-2 flex flex-wrap items-center gap-1.5"><button type="button" onClick={() => saveFeedback({ scope: "reply", target: message, tags: ["Good reply"] })} disabled={savingFeedback || feedback.some((item) => item.message_id === message.id && item.tags?.includes("Good reply"))} className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2 py-1 text-[10px] font-bold text-slate-500 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 disabled:opacity-45"><ThumbsUp size={12} />Good</button><button type="button" onClick={() => { setFeedbackTarget(message); setSelectedTags([]); setFeedbackNote(""); setIdealReply(""); }} className="rounded-full border border-slate-200 px-2 py-1 text-[10px] font-bold text-slate-500 transition hover:border-primary/35 hover:bg-primary-tint hover:text-primary">Suggest change</button>{feedback.filter((item) => item.message_id === message.id).length > 0 && <span className="text-[10px] font-semibold text-primary">{feedback.filter((item) => item.message_id === message.id).length} saved</span>}</div>}
                  </div>
                </div>
              ))}
              {sending && (
                <div className="chat-message-enter flex justify-start">
                  <div className="rounded-2xl rounded-bl-sm border border-slate-200 bg-white px-4 py-3 text-xs text-slate-500 shadow-sm">
                    <span className="inline-flex items-center gap-2">
                      <Loader2
                        size={14}
                        className="animate-spin text-primary"
                      />
                      {agentName} is thinking…
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          <form
            onSubmit={sendMessage}
            className="orb-guide-prompt border-t border-slate-200 bg-white p-4 sm:p-5"
          >
            <div className="orb-prompt-field rounded-xl border p-3 transition focus-within:ring-4 focus-within:ring-primary/10">
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    sendMessage(event);
                  }
                }}
                disabled={sending || !activeBrand?.id}
                rows={2}
                placeholder={
                  brandsLoading
                    ? "Loading brand…"
                    : activeBrand
                      ? `Message ${agentName}…`
                      : "Choose a brand to start testing"
                }
                className="block min-h-14 w-full resize-none bg-transparent px-0 py-0 text-[15px] leading-6 text-slate-800 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed"
              />
              <div className="flex items-center justify-between gap-3 px-1 pb-1">
                <p className="text-[10px] text-slate-400">
                  Enter to send · Shift+Enter for a new line
                </p>
                <button
                  type="submit"
                  disabled={!draft.trim() || sending || !activeBrand?.id}
                  aria-label="Send test message"
                  className="orb-prompt-field__send grid h-8 w-8 place-items-center rounded-lg transition disabled:cursor-not-allowed"
                >
                  {sending ? (
                    <Loader2 size={15} className="animate-spin" />
                  ) : (
                    <ArrowUp size={17} strokeWidth={2.5} />
                  )}
                </button>
              </div>
            </div>
            {error && (
              <p
                role="alert"
                className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700"
              >
                {error}
              </p>
            )}
          </form>
        </div>
        <aside className={`w-full shrink-0 overflow-y-auto border-t border-slate-200 bg-slate-50/70 p-5 lg:border-l lg:border-t-0 ${isFullscreen ? "lg:w-[23rem]" : "lg:w-[21rem]"}`}>
          <div>
            <h2 className="text-sm font-extrabold text-slate-900">Feedback</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Help improve this brand’s AI without changing its live knowledge yet.
            </p>
          </div>

          <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            {feedbackTarget ? (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-indigo-600">Reply feedback</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">Tell the team what needs to improve.</p>
                  </div>
                  <button
                    type="button"
                    onClick={resetReplyFeedback}
                    className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                    aria-label="Close reply feedback"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <p className="mt-3 line-clamp-3 rounded-lg bg-slate-50 p-2 text-xs leading-5 text-slate-600">
                  {feedbackTarget.text}
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {feedbackTags.map((tag) => {
                    const active = selectedTags.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => toggleFeedbackTag(tag)}
                        className={`rounded-full border px-2 py-1 text-[11px] font-semibold transition ${active
                          ? "border-indigo-600 bg-indigo-600 text-white"
                          : "border-slate-200 bg-white text-slate-600 hover:border-indigo-300"
                          }`}
                        aria-pressed={active}
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>
                <label className="mt-3 block text-xs font-bold text-slate-700" htmlFor="reply-feedback-note">
                  What should change?
                </label>
                <textarea
                  id="reply-feedback-note"
                  value={feedbackNote}
                  onChange={(event) => setFeedbackNote(event.target.value)}
                  placeholder="Share the issue or missing detail…"
                  rows={3}
                  className="mt-1 w-full resize-y rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs leading-5 text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                />
                <label className="mt-3 block text-xs font-bold text-slate-700" htmlFor="ideal-agent-reply">
                  Ideal reply <span className="font-normal text-slate-400">(optional)</span>
                </label>
                <textarea
                  id="ideal-agent-reply"
                  value={idealReply}
                  onChange={(event) => setIdealReply(event.target.value)}
                  placeholder="What should the AI have said?"
                  rows={3}
                  className="mt-1 w-full resize-y rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs leading-5 text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                />
                <div className="mt-3 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={resetReplyFeedback}
                    className="rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={savingFeedback || (!selectedTags.length && !feedbackNote.trim() && !idealReply.trim())}
                    onClick={() => saveFeedback({
                      scope: "reply",
                      target: feedbackTarget,
                      tags: selectedTags,
                      note: feedbackNote,
                      ideal: idealReply,
                    })}
                    className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-extrabold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {savingFeedback ? "Saving…" : "Save feedback"}
                  </button>
                </div>
              </>
            ) : (
              <p className="text-xs leading-5 text-slate-500">
                Choose <strong className="font-bold text-slate-700">Suggest change</strong> under an AI reply to give detailed feedback.
              </p>
            )}
          </div>

          <div className="mt-5 border-t border-slate-200 pt-4">
            <label className="block text-xs font-extrabold text-slate-800" htmlFor="conversation-feedback-note">
              Overall chat note
            </label>
            <p className="mt-1 text-xs leading-5 text-slate-500">For feedback about the conversation as a whole.</p>
            <textarea
              id="conversation-feedback-note"
              value={overallNote}
              onChange={(event) => setOverallNote(event.target.value)}
              placeholder="What worked well or needs improvement?"
              rows={3}
              className="mt-2 w-full resize-y rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs leading-5 text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            />
            <button
              type="button"
              disabled={savingFeedback || !overallNote.trim()}
              onClick={() => saveFeedback({ scope: "conversation", note: overallNote })}
              className="mt-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-extrabold text-slate-700 transition hover:border-indigo-300 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {savingFeedback ? "Saving…" : "Add overall note"}
            </button>
          </div>

          <div className="mt-5 border-t border-slate-200 pt-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-extrabold uppercase tracking-[0.12em] text-slate-700">Feedback log</h3>
              <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-600">{feedback.length}</span>
            </div>
            {feedback.length ? (
              <div className="mt-3 space-y-2">
                {[...feedback].reverse().slice(0, 6).map((item) => (
                  <article key={item.id} className="rounded-xl border border-slate-200 bg-white p-2.5 text-xs">
                    <p className="font-bold text-slate-800">{item.scope === "reply" ? "AI reply" : "Whole conversation"}</p>
                    {item.tags?.length ? <p className="mt-1 text-[11px] font-semibold text-indigo-600">{item.tags.join(" · ")}</p> : null}
                    <p className="mt-1 leading-5 text-slate-600">{item.note || "Marked as a good reply."}</p>
                    {item.ideal_reply ? <p className="mt-1.5 border-t border-slate-100 pt-1.5 leading-5 text-slate-500">Ideal: {item.ideal_reply}</p> : null}
                  </article>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-xs leading-5 text-slate-500">Feedback you send in this test chat will appear here.</p>
            )}
          </div>
        </aside>
      </section>
    </div>
  );
}
