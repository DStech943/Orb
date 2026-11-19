import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import {
  ArrowUp,
  Eraser,
  ExternalLink,
  Flag,
  Loader2,
  Maximize2,
  MessageCircleMore,
  Minimize2,
  Plus,
  Search,
  ThumbsUp,
  X,
} from "lucide-react";
import Orb from "../components/Orb";
import ReportIssueModal, { issueCategoryLabel } from "../components/chat/ReportIssueModal";
import Avatar from "../components/ui/Avatar";
import { buildTranscript, newIdempotencyKey } from "../lib/transcript";
import { timeAgo } from "../lib/format";
import { listTestSessions, removeTestSession, touchTestSession } from "../lib/testSessions";
import { listBrands } from "../services/brands";
import {
  chatWithBrandAgent,
  clearBrandChatHistory,
  createBrandAgentFeedback,
  getBrandChatHistory,
  hasBrandAgentApi,
  hasOrbApi,
  listBrandAgentFeedback,
  reportBrandAgentIssue,
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
const FULLSCREEN_DEFAULT_KEY = "orb:agent-chat:open-fullscreen-by-default";

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

const diagnosticDecision = (diagnostic) => {
  if (diagnostic?.is_handoff) return "Escalated to human";
  return diagnostic?.route === "auto_send" ? "Auto-send eligible" : "Requires review";
};

const diagnosticSources = (diagnostic) =>
  (Array.isArray(diagnostic?.sources) ? diagnostic.sources : []).filter(
    (source) => source?.collection === "FAQ" || source?.collection === "SOP",
  );

const diagnosticSourceHref = (source = {}) => {
  const params = new URLSearchParams({
    tab: source.collection === "FAQ" ? "faqs" : "sops",
  });
  const sourceId = String(source.id || source.orb_id || source.point_id || "").trim();
  const title = String(source.title || "").trim();
  const detail = String(source.detail || "").trim();
  if (sourceId) params.set("reference_id", sourceId);
  if (title) params.set("reference_title", title);
  if (detail) params.set("reference_detail", detail);
  return `/app/brain?${params.toString()}`;
};

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
  const { user, isAdmin } = useAuth();
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
  const [diagnostic, setDiagnostic] = useState(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportTarget, setReportTarget] = useState(null);
  const [openFullscreenByDefault, setOpenFullscreenByDefault] = useState(
    () => typeof window !== "undefined" && window.localStorage.getItem(FULLSCREEN_DEFAULT_KEY) === "true",
  );
  const [isFullscreen, setIsFullscreen] = useState(
    () => typeof window !== "undefined" && window.localStorage.getItem(FULLSCREEN_DEFAULT_KEY) === "true",
  );
  const messagesRef = useRef(null);
  const messageScrollTopRef = useRef(0);
  const [sessions, setSessions] = useState([]);
  const activeBrand = brands.find((brand) => brand.id === brandId) || brands[0];
  const configuredAgentName = String(activeBrand?.ai_agent_name || "").trim();
  const agentName = agentNameOverride || configuredAgentName || "AI";
  const title = `Test ${agentName}`;

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
        setReportOpen(false);
        setReportTarget(null);
        setDiagnostic(null);
        setError("");
        setSessionId(sessionForBrand());
      }
    };
    window.addEventListener("orb:brand-changed", onBrandChange);
    return () => window.removeEventListener("orb:brand-changed", onBrandChange);
  }, []);

  // Remember each test conversation (id, a short title, timing) for this brand so it can be
  // reopened later. The conversation itself is always re-read from the agent API.
  useEffect(() => {
    if (!activeBrand?.id || !sessionId || !messages.length) return;
    const firstQuestion = messages.find((message) => message.role === "user")?.text || "";
    touchTestSession(activeBrand.id, sessionId, {
      title: firstQuestion.slice(0, 60) || "New test",
      messageCount: messages.length,
    });
  }, [activeBrand?.id, sessionId, messages]);

  useEffect(() => {
    if (!activeBrand?.id) {
      setSessions([]);
      return undefined;
    }
    const refresh = () => setSessions(listTestSessions(activeBrand.id));
    refresh();
    window.addEventListener("orb:test-sessions-changed", refresh);
    return () => window.removeEventListener("orb:test-sessions-changed", refresh);
  }, [activeBrand?.id]);

  useEffect(() => {
    messagesRef.current?.scrollTo({
      top: messagesRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, sending]);

  const updateFullscreen = (nextFullscreen) => {
    messageScrollTopRef.current = messagesRef.current?.scrollTop || 0;
    setIsFullscreen(nextFullscreen);
  };

  useEffect(() => {
    if (!isFullscreen) return undefined;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") updateFullscreen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [isFullscreen]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (messagesRef.current) messagesRef.current.scrollTop = messageScrollTopRef.current;
    });
    return () => cancelAnimationFrame(frame);
  }, [isFullscreen]);

  const setFullscreenDefault = (enabled) => {
    setOpenFullscreenByDefault(enabled);
    window.localStorage.setItem(FULLSCREEN_DEFAULT_KEY, String(enabled));
  };

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
    setReportOpen(false);
    setReportTarget(null);
    setDiagnostic(null);
    setDraft("");
    setError("");
    setSessionId(sessionForBrand());
  };

  const resetConversationState = () => {
    setMessages([]);
    setFeedback([]);
    setFeedbackTarget(null);
    setReportOpen(false);
    setReportTarget(null);
    setDiagnostic(null);
    setDraft("");
    setError("");
  };

  // Starts a fresh test but keeps the previous one available in the session list.
  const newConversation = () => {
    resetConversationState();
    setSessionId(sessionForBrand());
    setSessionsOpen(false);
  };

  const openSession = (id) => {
    if (id === sessionId) {
      setSessionsOpen(false);
      return;
    }
    resetConversationState();
    setSessionId(id);
    setSessionsOpen(false);
  };

  const deleteSession = async (id) => {
    if (!activeBrand?.id) return;
    if (hasBrandAgentApi) {
      try {
        await clearBrandChatHistory(activeBrand.id, id);
      } catch (cause) {
        showToast(cause?.message || "Could not delete this test conversation.", "error");
        return;
      }
    }
    removeTestSession(activeBrand.id, id);
    if (id === sessionId) newConversation();
  };

  const openReport = (target = null) => {
    setReportTarget(target);
    setReportOpen(true);
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
      setDiagnostic(result || null);
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
      const conversationHistory = scope === "conversation"
        ? messages.map((message) => ({
            role: message.role,
            text: message.text,
            created_at: message.createdAt instanceof Date
              ? message.createdAt.toISOString()
              : new Date(message.createdAt || Date.now()).toISOString(),
          }))
        : [];
      const result = await createBrandAgentFeedback(activeBrand.id, {
        session_id: sessionId,
        scope,
        message_id: target?.id || "",
        agent_reply: target?.text || "",
        tags,
        note: note.trim(),
        ideal_reply: ideal.trim(),
        conversation_history: conversationHistory,
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

  const qdrantSources = diagnosticSources(diagnostic);
  const toolsUsed = Array.isArray(diagnostic?.tools_used) ? diagnostic.tools_used.filter(Boolean) : [];
  const decisionReason = String(diagnostic?.handoff_reason || diagnostic?.route_reason || "").trim();
  const latency = Number(diagnostic?.latency_ms);
  const cost = Number(diagnostic?.cost_usd);
  const totalTokens = Number(diagnostic?.total_tokens);

  const toggleFeedbackTag = (tag) => setSelectedTags((tags) => tags.includes(tag) ? tags.filter((item) => item !== tag) : [...tags, tag]);

  const chatWorkspace = (
    <div
      className={`flex flex-col ${isFullscreen ? "fixed inset-0 z-[100] h-[100dvh] w-screen min-h-0 max-w-none overflow-hidden bg-canvas" : `mx-auto ${embedded ? "h-[calc(100dvh-13rem)] min-h-[42rem] max-w-7xl" : "h-[calc(100dvh-6.5rem)] min-h-[34rem] max-w-7xl"}`}`}
      role={isFullscreen ? "dialog" : undefined}
      aria-modal={isFullscreen || undefined}
      aria-label={isFullscreen ? `${title} full screen` : undefined}
    >
      <div className={`flex flex-wrap items-end justify-between gap-3 ${isFullscreen ? "mb-0 border-b border-line bg-white px-5 pb-3 pt-5" : "mb-5"}`}>
        {!isFullscreen && <div className="min-w-0">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-primary">Agent experience</p>
            {activeBrand?.name && (
              <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-line bg-white py-0.5 pl-0.5 pr-2.5 text-xs text-fg-muted">
                <Avatar name={activeBrand.name} className="h-5 w-5 text-[9px]" />
                <span className="truncate">{activeBrand.name}</span>
              </span>
            )}
          </div>
          <h2 className="font-display text-[1.75rem] font-medium leading-tight text-ink">
            {embedded ? title : <>Chat with <em>{agentName}</em></>}
          </h2>
          <p className="mt-1 max-w-xl text-sm leading-5 text-fg-muted">
            Ask {agentName} what your customers would ask, then flag anything that isn’t right.
          </p>
        </div>}
        <div className="ml-auto flex flex-col items-end gap-1.5">
          <div className="flex flex-wrap items-center justify-end gap-2">
            {!embedded && (
              <button
                type="button"
                onClick={newConversation}
                className="inline-flex h-9 items-center gap-2 rounded-control bg-primary px-3 text-xs font-medium text-white shadow-card transition hover:bg-primary-dark"
              >
                <Plus size={15} />
                New test
              </button>
            )}
            <button
              type="button"
              onClick={() => updateFullscreen(!isFullscreen)}
              className="inline-flex items-center gap-2 rounded-md border border-line bg-white px-3 py-2 text-xs font-medium text-fg-muted transition hover:border-primary/35 hover:bg-primary-tint/30 hover:text-primary"
              aria-label={isFullscreen ? "Exit full screen" : "Open chat full screen"}
              title={isFullscreen ? "Exit full screen (Esc)" : "Open chat full screen"}
            >
              {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
              <span className="hidden sm:inline">{isFullscreen ? "Exit full screen" : "Full screen"}</span>
            </button>
            <button
              type="button"
              onClick={() => openReport()}
              disabled={!messages.length || sending}
              className="inline-flex items-center gap-2 rounded-md border border-line bg-white px-3 py-2 text-xs font-medium text-fg-muted transition hover:border-orange/60 hover:bg-orange/10 hover:text-ink disabled:cursor-not-allowed disabled:opacity-45"
              title="Report a problem with this conversation to the team"
            >
              <Flag size={15} />
              Report issue
            </button>
            <button
              type="button"
              onClick={clearChat}
              disabled={!messages.length && !draft && !error}
              className="inline-flex items-center gap-2 rounded-md border border-line bg-white px-3 py-2 text-xs font-medium text-fg-muted transition hover:border-line-strong hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Eraser size={15} />
              Clear this chat
            </button>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-[10px] font-medium text-fg-muted">
            {isFullscreen && <span>Press Esc to return to the smaller view.</span>}
            <label className="inline-flex cursor-pointer items-center gap-1.5 text-fg-muted">
              <input type="checkbox" checked={openFullscreenByDefault} onChange={(event) => setFullscreenDefault(event.target.checked)} className="h-3 w-3 rounded border-line-strong text-primary focus:ring-primary" />
              Open full screen by default
            </label>
          </div>
        </div>
      </div>
      <section className={`flex min-h-0 flex-1 flex-col overflow-hidden bg-white lg:flex-row ${isFullscreen ? "rounded-none border-0 shadow-none" : "rounded-2xl border border-line shadow-card"}`}>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col lg:border-r lg:border-line">
          <header className="flex items-center gap-3 border-b border-line bg-white px-5 py-4 sm:px-6">
            <AgentOrb className="h-10 w-10 shadow-sm" />
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold text-ink">
                {agentName}
              </h3>
              <p className="text-xs text-fg-muted">Deployed support agent</p>
            </div>
            <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-success-tint px-2.5 py-1 text-[10px] font-semibold text-success">
              <i className="h-1.5 w-1.5 rounded-full bg-success" />
              Test mode
            </span>
          </header>

          <div
            ref={messagesRef}
            className="thin-scroll min-h-0 flex-1 overflow-y-auto bg-white/40 p-5 sm:p-6"
          >
            {!messages.length && !sending && (
              <div className="grid min-h-full place-items-center">
                <div className="max-w-md text-center">
                  <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-primary-tint text-primary">
                    <MessageCircleMore size={24} />
                  </div>
                  <h4 className="mt-4 text-lg font-semibold text-ink">
                    Start a test conversation
                  </h4>
                  <p className="mt-2 text-sm leading-6 text-fg-muted">
                    Ask the same questions your customers would ask. The reply
                    comes from {agentName}’s deployed agent.
                  </p>
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    {prompts.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={(event) => sendMessage(event, prompt)}
                        className="rounded-full border border-line bg-white px-3.5 py-2 text-left text-xs font-medium text-fg-muted transition hover:border-primary/40 hover:bg-primary-tint hover:text-primary"
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
                    className={`max-w-[78%] px-4 py-3 text-[15px] leading-6 shadow-sm sm:max-w-[68%] ${message.role === "user" ? "rounded-2xl rounded-br-sm bg-primary text-white" : "rounded-2xl rounded-bl-sm border border-line bg-white text-ink"}`}
                  >
                    <p className="whitespace-pre-wrap">{message.text}</p>
                    <p
                      className={`mt-1 text-[10px] ${message.role === "user" ? "text-white/65" : "text-fg-muted"}`}
                    >
                      {timeLabel(message.createdAt)}
                    </p>
                    {message.role === "agent" && <div className="mt-2 flex flex-wrap items-center gap-1.5"><button type="button" onClick={() => saveFeedback({ scope: "reply", target: message, tags: ["Good reply"] })} disabled={savingFeedback || feedback.some((item) => item.message_id === message.id && item.tags?.includes("Good reply"))} className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-1 text-[10px] font-medium text-fg-muted transition hover:border-success/40 hover:bg-success-tint hover:text-success disabled:opacity-45"><ThumbsUp size={12} />Good</button><button type="button" onClick={() => { setFeedbackTarget(message); setSelectedTags([]); setFeedbackNote(""); setIdealReply(""); }} className="rounded-full border border-line px-2 py-1 text-[10px] font-medium text-fg-muted transition hover:border-primary/35 hover:bg-primary-tint hover:text-primary">Suggest change</button><button type="button" onClick={() => openReport(message)} className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-1 text-[10px] font-medium text-fg-muted transition hover:border-orange/60 hover:bg-orange/10 hover:text-ink"><Flag size={11} />Report issue</button>{feedback.filter((item) => item.message_id === message.id).length > 0 && <span className="text-[10px] font-semibold text-primary">{feedback.filter((item) => item.message_id === message.id).length} saved</span>}</div>}
                  </div>
                </div>
              ))}
              {sending && (
                <div className="chat-message-enter flex justify-start">
                  <div className="rounded-2xl rounded-bl-sm border border-line bg-white px-4 py-3 text-xs text-fg-muted shadow-sm">
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
            className="orb-guide-prompt border-t border-line bg-white p-4 sm:p-5"
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
                className="block min-h-14 w-full resize-none bg-transparent px-0 py-0 text-[15px] leading-6 text-ink outline-none placeholder:text-fg-muted/70 disabled:cursor-not-allowed"
              />
              <div className="flex items-center justify-between gap-3 px-1 pb-1">
                <p className="text-[10px] text-fg-muted">
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
                className="mt-3 rounded-md border border-danger/20 bg-danger-tint px-3 py-2 text-xs font-medium text-danger"
              >
                {error}
              </p>
            )}
          </form>
        </div>
        <aside className={`w-full shrink-0 overflow-y-auto border-t border-line bg-canvas p-5 lg:border-l lg:border-t-0 ${isFullscreen ? "lg:w-[23rem]" : "lg:w-[21rem]"}`}>
          <div className="mb-4 flex items-center gap-3 rounded-xl border border-line bg-white p-3">
            <Avatar name={activeBrand?.name} shape="lg" className="h-9 w-9" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink">{activeBrand?.name || "No brand selected"}</p>
              <p className="truncate text-xs text-fg-muted">Testing {agentName} · reports are saved for this brand</p>
            </div>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-ink">Feedback</h2>
            <p className="mt-1 text-xs leading-5 text-fg-muted">
              Help improve this brand’s AI without changing its live knowledge yet.
            </p>
          </div>

          {isAdmin && diagnostic && (
            <section className="mt-4 rounded-2xl border border-line bg-white p-3 shadow-card" aria-label="Latest agent run diagnostics">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-muted">Latest run</p>
                  <p className={`mt-1 text-xs font-semibold ${diagnostic.is_handoff ? "text-warning" : diagnostic.route === "auto_send" ? "text-success" : "text-primary"}`}>
                    {diagnosticDecision(diagnostic)}
                  </p>
                </div>
                {diagnostic.is_handoff ? <span className="rounded-full bg-warning-tint px-2 py-0.5 text-[10px] font-medium text-warning">Handoff</span> : null}
              </div>
              {decisionReason ? <p className="mt-1.5 text-[11px] leading-4 text-fg-muted">{decisionReason}</p> : null}
              <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                <div className="rounded-lg bg-canvas px-2.5 py-2"><p className="font-semibold text-fg-muted">Latency</p><p className="mt-0.5 font-semibold text-ink">{Number.isFinite(latency) ? `${latency} ms` : "—"}</p></div>
                <div className="rounded-lg bg-canvas px-2.5 py-2"><p className="font-semibold text-fg-muted">LLM usage</p><p className="mt-0.5 font-semibold text-ink">{Number.isFinite(cost) ? `$${cost.toFixed(4)}` : "—"}{Number.isFinite(totalTokens) ? ` · ${totalTokens} tok` : ""}</p></div>
              </div>
              <div className="mt-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-fg-muted">Tools used</p>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {toolsUsed.length ? toolsUsed.map((tool) => <span key={tool} className="rounded-full bg-primary-tint px-2 py-1 text-[10px] font-medium text-primary">{tool}</span>) : <span className="text-[11px] text-fg-muted">None</span>}
                </div>
              </div>
              <details className="mt-3 border-t border-line pt-2.5">
                <summary className="cursor-pointer text-[10px] font-semibold uppercase tracking-[0.1em] text-fg-muted">FAQs &amp; SOPs used ({qdrantSources.length})</summary>
                {qdrantSources.length ? <div className="mt-2 space-y-1.5">{qdrantSources.map((source, index) => { const sourceLabel = String(source.title || source.detail || "Untitled").trim(); return <a key={`${source.collection}-${sourceLabel}-${index}`} href={diagnosticSourceHref(source)} target="_blank" rel="noreferrer" title={`Open this ${String(source.collection || "knowledge").toLowerCase()} in AI's Brain`} className="block rounded-lg bg-canvas px-2.5 py-2 transition hover:bg-primary-tint hover:ring-1 hover:ring-indigo-200"><div className="flex items-center gap-1.5"><span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${source.collection === "FAQ" ? "bg-sky-100 text-sky-700" : "bg-violet-100 text-violet-700"}`}>{source.collection}</span><span className="min-w-0 flex-1 truncate text-[11px] font-medium text-ink">{sourceLabel}</span><span className="text-[10px] font-semibold text-fg-muted">{Number(source.score || 0).toFixed(2)}</span><ExternalLink size={12} className="shrink-0 text-fg-muted" aria-hidden="true" /></div></a> })}</div> : <p className="mt-2 text-[11px] text-fg-muted">None</p>}
              </details>
            </section>
          )}

          <div className="mt-4 rounded-2xl border border-line bg-white p-3 shadow-sm">
            {feedbackTarget ? (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">Reply feedback</p>
                    <p className="mt-1 text-xs leading-5 text-fg-muted">Tell the team what needs to improve.</p>
                  </div>
                  <button
                    type="button"
                    onClick={resetReplyFeedback}
                    className="rounded-md p-1 text-fg-muted transition hover:bg-subtle hover:text-ink"
                    aria-label="Close reply feedback"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <p className="mt-3 line-clamp-3 rounded-lg bg-canvas p-2 text-xs leading-5 text-fg-muted">
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
                          ? "border-primary bg-primary text-white"
                          : "border-line bg-white text-fg-muted hover:border-primary/40"
                          }`}
                        aria-pressed={active}
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>
                <label className="mt-3 block text-xs font-medium text-ink" htmlFor="reply-feedback-note">
                  What should change?
                </label>
                <textarea
                  id="reply-feedback-note"
                  value={feedbackNote}
                  onChange={(event) => setFeedbackNote(event.target.value)}
                  placeholder="Share the issue or missing detail…"
                  rows={3}
                  className="mt-1 w-full resize-y rounded-lg border border-line bg-white px-2.5 py-2 text-xs leading-5 text-ink outline-none transition placeholder:text-fg-muted/70 focus:border-primary focus:ring-4 focus:ring-primary/15"
                />
                <label className="mt-3 block text-xs font-medium text-ink" htmlFor="ideal-agent-reply">
                  Ideal reply <span className="font-normal text-fg-muted">(optional)</span>
                </label>
                <textarea
                  id="ideal-agent-reply"
                  value={idealReply}
                  onChange={(event) => setIdealReply(event.target.value)}
                  placeholder="What should the AI have said?"
                  rows={3}
                  className="mt-1 w-full resize-y rounded-lg border border-line bg-white px-2.5 py-2 text-xs leading-5 text-ink outline-none transition placeholder:text-fg-muted/70 focus:border-primary focus:ring-4 focus:ring-primary/15"
                />
                <div className="mt-3 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={resetReplyFeedback}
                    className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-fg-muted transition hover:bg-subtle"
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
                    className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {savingFeedback ? "Saving…" : "Save feedback"}
                  </button>
                </div>
              </>
            ) : (
              <p className="text-xs leading-5 text-fg-muted">
                Choose <strong className="font-medium text-ink">Suggest change</strong> under an AI reply to give detailed feedback.
              </p>
            )}
          </div>

          <div className="mt-5 border-t border-line pt-4">
            <label className="block text-xs font-semibold text-ink" htmlFor="conversation-feedback-note">
              Overall chat note
            </label>
            <p className="mt-1 text-xs leading-5 text-fg-muted">For feedback about the conversation as a whole.</p>
            <textarea
              id="conversation-feedback-note"
              value={overallNote}
              onChange={(event) => setOverallNote(event.target.value)}
              placeholder="What worked well or needs improvement?"
              rows={3}
              className="mt-2 w-full resize-y rounded-lg border border-line bg-white px-2.5 py-2 text-xs leading-5 text-ink outline-none transition placeholder:text-fg-muted/70 focus:border-primary focus:ring-4 focus:ring-primary/15"
            />
            <button
              type="button"
              disabled={savingFeedback || !overallNote.trim()}
              onClick={() => saveFeedback({ scope: "conversation", note: overallNote })}
              className="mt-3 rounded-lg border border-line-strong bg-white px-3 py-1.5 text-xs font-semibold text-ink transition hover:border-primary/40 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              {savingFeedback ? "Saving…" : "Add overall note"}
            </button>
          </div>

          <div className="mt-5 border-t border-line pt-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-ink">Feedback log</h3>
              <span className="rounded-full bg-line px-2 py-0.5 text-[10px] font-medium text-fg-muted">{feedback.length}</span>
            </div>
            {feedback.length ? (
              <div className="mt-3 space-y-2">
                {[...feedback].reverse().slice(0, 6).map((item) => (
                  <article key={item.id} className="rounded-xl border border-line bg-white p-2.5 text-xs">
                    <p className="font-medium text-ink">{item.scope === "reply" ? "AI reply" : "Whole conversation"}</p>
                    {item.category ? <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-orange/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink"><Flag size={10} />Reported · {issueCategoryLabel(item.category) || item.category}</p> : null}
                    {!item.category && item.slack_delivery_status && item.slack_delivery_status !== "not_applicable" ? <p className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${item.slack_delivery_status === "failed" ? (item.slack_message_posted ? "bg-warning-tint text-warning" : "bg-danger-tint text-danger") : "bg-success-tint text-success"}`}>{item.slack_delivery_status === "failed" ? (item.slack_message_posted ? "Sent to Slack · file missing" : "Slack delivery failed") : "Sent to team on Slack"}</p> : null}
                    {item.slack_delivery_status && item.slack_delivery_status !== "not_applicable" && activeBrand?.id ? <Link to={`/app/reports/${activeBrand.id}/${item.id}`} className="mt-1 block text-[11px] font-medium text-primary hover:underline">View report and conversation</Link> : null}
                    {item.tags?.length ? <p className="mt-1 text-[11px] font-semibold text-primary">{item.tags.join(" · ")}</p> : null}
                    <p className="mt-1 leading-5 text-fg-muted">{item.note || "Marked as a good reply."}</p>
                    {item.ideal_reply ? <p className="mt-1.5 border-t border-line pt-1.5 leading-5 text-fg-muted">Ideal: {item.ideal_reply}</p> : null}
                  </article>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-xs leading-5 text-fg-muted">Feedback you send in this test chat will appear here.</p>
            )}
          </div>
        </aside>
      </section>
      <ReportIssueModal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        brandId={activeBrand?.id}
        brandName={activeBrand?.name}
        agentName={agentName}
        sessionId={sessionId}
        messages={messages}
        targetMessage={reportTarget}
        onClearTarget={() => setReportTarget(null)}
        onSubmitted={(saved) => {
          if (saved) setFeedback((items) => [...items, saved]);
        }}
      />
    </div>
  );
  return isFullscreen && typeof document !== "undefined" ? createPortal(chatWorkspace, document.body) : chatWorkspace;
}
