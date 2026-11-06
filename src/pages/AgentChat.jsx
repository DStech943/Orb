import React, { useEffect, useRef, useState } from "react";
import {
  Check,
  Eraser,
  Loader2,
  MessageCircleMore,
  Pencil,
  SendHorizontal,
  X,
} from "lucide-react";
import Orb from "../components/Orb";
import { listBrands } from "../services/brands";
import {
  chatWithBrandAgent,
  clearBrandChatHistory,
  getBrandChatHistory,
  hasBrandAgentApi,
  hasOrbApi,
  setRemoteBrandProfile,
} from "../services/orbApi";
import useAsync from "../hooks/useAsync";
import { useToast } from "../context/ToastContext";
import { useAuth } from "../context/AuthContext";

const prompts = [
  "What is your return policy?",
  "Can you help me track my order?",
  "Do you have this product in stock?",
];

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
  const [editingAgentName, setEditingAgentName] = useState(false);
  const [agentNameDraft, setAgentNameDraft] = useState("");
  const [savingAgentName, setSavingAgentName] = useState(false);
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
    setEditingAgentName(false);
    setAgentNameDraft("");
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
    const onBrandChange = (event) => {
      if (event.detail?.id) {
        setBrandId(event.detail.id);
        setMessages([]);
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
    setDraft("");
    setError("");
    if (!hasBrandAgentApi) setSessionId(newSessionId());
  };

  const beginAgentNameEdit = () => {
    setAgentNameDraft(configuredAgentName);
    setEditingAgentName(true);
  };

  const saveAgentName = async (event) => {
    event?.preventDefault();
    if (!activeBrand?.id || savingAgentName) return;
    if (!hasOrbApi) {
      showToast("Start the Orb backend to save the agent name.", "error");
      return;
    }
    setSavingAgentName(true);
    try {
      const result = await setRemoteBrandProfile(activeBrand.id, {
        website_url: activeBrand.profile?.website_url || "",
        support_email: activeBrand.profile?.support_email || "",
        description: activeBrand.description || "",
        ai_agent_name: agentNameDraft.trim(),
      });
      const savedName = String(result?.brand?.ai_agent_name || "").trim();
      setAgentNameOverride(savedName);
      setEditingAgentName(false);
      window.localStorage.setItem("orb_selected_brand_agent_name", savedName);
      window.dispatchEvent(
        new CustomEvent("orb:brand-changed", {
          detail: { ...activeBrand, ai_agent_name: savedName },
        }),
      );
      showToast(
        savedName
          ? `Agent name updated to ${savedName}.`
          : "Agent name cleared. Chat with AI will be used.",
      );
    } catch (cause) {
      showToast(cause?.message || "Could not save the agent name.", "error");
    } finally {
      setSavingAgentName(false);
    }
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

  return (
    <div
      className={`mx-auto flex max-w-5xl flex-col ${embedded ? "min-h-[calc(100vh-15rem)]" : "min-h-[calc(100vh-8rem)]"}`}
    >
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
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
            onClick={beginAgentNameEdit}
            disabled={!activeBrand?.id || savingAgentName}
            className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition hover:border-primary/35 hover:bg-primary-tint hover:text-primary disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Pencil size={14} />
            Edit name
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
      {editingAgentName && (
        <form
          onSubmit={saveAgentName}
          className="mb-5 flex max-w-md items-center gap-2 rounded-lg border border-primary/20 bg-primary-tint/35 p-2"
        >
          <label className="sr-only" htmlFor="agent-display-name">
            Agent display name
          </label>
          <input
            id="agent-display-name"
            autoFocus
            value={agentNameDraft}
            onChange={(event) => setAgentNameDraft(event.target.value)}
            maxLength={120}
            placeholder="Maya AI"
            className="min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
          />
          <button
            type="submit"
            disabled={savingAgentName}
            aria-label="Save agent name"
            className="grid h-9 w-9 place-items-center rounded-md bg-primary text-white transition hover:bg-primary-dark disabled:opacity-50"
          >
            {savingAgentName ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <Check size={16} />
            )}
          </button>
          <button
            type="button"
            onClick={() => setEditingAgentName(false)}
            disabled={savingAgentName}
            aria-label="Cancel editing agent name"
            className="grid h-9 w-9 place-items-center rounded-md text-slate-500 transition hover:bg-white hover:text-slate-800"
          >
            <X size={16} />
          </button>
        </form>
      )}

      <section className="flex min-h-0 flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
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
            className="min-h-0 flex-1 overflow-y-auto bg-[#f7f8fa] p-5 sm:p-6"
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
            <div className="mx-auto max-w-2xl space-y-3">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex gap-3 ${message.role === "user" ? "justify-end" : ""}`}
                >
                  <div
                    className={`max-w-[82%] px-4 py-3 text-sm leading-6 shadow-sm ${message.role === "user" ? "rounded-2xl rounded-br-sm bg-[#d9fdd3] text-slate-800" : "rounded-2xl rounded-bl-sm border border-slate-200 bg-white text-slate-700"}`}
                  >
                    <p className="whitespace-pre-wrap">{message.text}</p>
                    <p
                      className={`mt-1 text-[10px] ${message.role === "user" ? "text-emerald-900/50" : "text-slate-400"}`}
                    >
                      {timeLabel(message.createdAt)}
                    </p>
                  </div>
                </div>
              ))}
              {sending && (
                <div className="flex">
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
            className="border-t border-slate-200 bg-white p-4 sm:p-5"
          >
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-2 transition focus-within:border-primary/45 focus-within:bg-white focus-within:ring-4 focus-within:ring-primary/10">
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
                className="block min-h-12 w-full resize-none bg-transparent px-2 py-1.5 text-sm leading-5 text-slate-800 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed"
              />
              <div className="flex items-center justify-between gap-3 px-1 pb-1">
                <p className="text-[10px] text-slate-400">
                  Enter to send · Shift+Enter for a new line
                </p>
                <button
                  type="submit"
                  disabled={!draft.trim() || sending || !activeBrand?.id}
                  aria-label="Send test message"
                  className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-white transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:bg-primary/35"
                >
                  {sending ? (
                    <Loader2 size={15} className="animate-spin" />
                  ) : (
                    <SendHorizontal size={15} />
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
      </section>
    </div>
  );
}
