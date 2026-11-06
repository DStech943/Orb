import React, { useEffect, useRef, useState } from "react";
import { ArrowUp, Check, RefreshCw } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import Orb from "../components/Orb";
import OrbLoader from "../components/ui/OrbLoader";
import useAsync from "../hooks/useAsync";
import { useToast } from "../context/ToastContext";
import { activeBrandName, createOperationalUpdate, hasOrbApi, listOperationalUpdates } from "../services/orbApi";

const typeDetails = {
  cs_update: {
    label: "CS Update",
    tone: "bg-sky-50 text-sky-700 ring-sky-100",
    acknowledgement: "I’ve logged this as a customer-support update and prepared the support follow-up.",
  },
  product_update: {
    label: "Product Update",
    tone: "bg-violet-50 text-violet-700 ring-violet-100",
    acknowledgement: "I’ve logged this as a product update and prepared the Shopify review work.",
  },
};

const formatDate = (value) => {
  if (!value) return "Just now";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Just now";
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);
};

function OrbMark({ small = false }) {
  const size = small ? "h-8 w-8" : "h-10 w-10";
  return <span className={`relative block shrink-0 overflow-hidden rounded-full ${size}`}><Orb colors={["#9c43fe", "#4cc2e9", "#101499"]} backgroundColor="#ffffff" size={1.1} glow={1} hoverIntensity={1} trail={1} rotateOnHover followCursor intro /></span>;
}

function UpdateExchange({ update }) {
  const details = typeDetails[update.classification] || typeDetails.cs_update;
  const actions = Array.isArray(update.action_plan) ? update.action_plan : [];
  return <div className="space-y-3">
    <div className="flex justify-end">
      <div className="max-w-[82%] rounded-2xl rounded-br-md bg-primary px-4 py-3 text-sm leading-6 text-white shadow-sm">
        <p className="whitespace-pre-wrap">{update.message}</p>
        <p className="mt-1 text-right text-[10px] font-medium text-white/65">{formatDate(update.created_at)}</p>
      </div>
    </div>
    <div className="flex items-start gap-2.5">
      <OrbMark small />
      <div className="max-w-[84%] rounded-2xl rounded-tl-md border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-700 shadow-sm">
        <div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2.5 py-0.5 text-[10px] font-extrabold ring-1 ${details.tone}`}>{details.label}</span><span className="text-[11px] text-slate-400">Queued</span></div>
        <p className="mt-2">{details.acknowledgement}</p>
        {actions.length > 0 && <div className="mt-3 grid gap-1.5 border-t border-slate-100 pt-3">
          {actions.map((action, index) => <p key={`${action.label}-${index}`} className="flex gap-2 text-xs leading-5 text-slate-500"><Check size={13} className="mt-1 shrink-0 text-primary" /><span><strong className="font-semibold text-slate-600">{action.system}:</strong> {action.label}</span></p>)}
        </div>}
      </div>
    </div>
  </div>;
}

export default function Operations() {
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [message, setMessage] = useState("");
  const [brandVersion, setBrandVersion] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const composerRef = useRef(null);
  const feedRef = useRef(null);
  useEffect(() => {
    if (searchParams.get("compose") !== "1") return;
    const frame = window.requestAnimationFrame(() => composerRef.current?.focus());
    const next = new URLSearchParams(searchParams);
    next.delete("compose");
    setSearchParams(next, { replace: true });
    return () => window.cancelAnimationFrame(frame);
  }, [searchParams, setSearchParams]);
  useEffect(() => {
    const onBrandChange = () => setBrandVersion((version) => version + 1);
    window.addEventListener("orb:brand-changed", onBrandChange);
    return () => window.removeEventListener("orb:brand-changed", onBrandChange);
  }, []);
  const loadUpdates = () => hasOrbApi && activeBrandName()
    ? listOperationalUpdates()
    : Promise.resolve({ updates: [] });
  const { data, loading, error, refreshing, reload } = useAsync(loadUpdates, [brandVersion]);
  const updates = Array.isArray(data?.updates) ? data.updates : [];
  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: "smooth" });
  }, [updates.length, submitting]);

  const submit = async (event) => {
    event.preventDefault();
    const content = message.trim();
    if (content.length < 8) {
      showToast("Add a little more detail so Orb can act on the update.", "error");
      return;
    }
    if (!activeBrandName()) {
      showToast("Choose a brand before recording an update.", "error");
      return;
    }
    setSubmitting(true);
    try {
      const result = await createOperationalUpdate(content);
      setMessage("");
      await reload();
      const label = typeDetails[result?.update?.classification]?.label || "Update";
      showToast(`${label} queued.`);
    } catch (submitError) {
      showToast(submitError.message || "Could not record this update.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  return <div className="page-enter mx-auto max-w-6xl">
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-xs font-extrabold uppercase tracking-widest text-primary">Brand operations</p>
        <h2 className="mt-1 text-3xl font-extrabold tracking-tight">Operations</h2>
        <p className="mt-2 text-sm text-slate-600">Give Orb a change in plain language and it will organise the next work for {activeBrandName() || "this brand"}.</p>
      </div>
      <button type="button" onClick={reload} disabled={loading || refreshing} className="inline-flex items-center gap-2 text-sm font-bold text-slate-500 transition hover:text-primary disabled:opacity-60"><RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />Refresh</button>
    </header>

    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_18px_50px_rgba(40,48,78,0.08)]">
      <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-5 py-4">
        <OrbMark />
        <div className="min-w-0"><h3 className="font-extrabold text-slate-900">Orb Operations</h3><p className="truncate text-xs text-slate-500">Your operational teammate for {activeBrandName() || "this brand"}</p></div>
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-extrabold text-emerald-700"><i className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Ready</span>
      </header>

      <div ref={feedRef} className="h-[min(31rem,calc(100vh-22rem))] min-h-80 overflow-y-auto px-4 py-6 sm:px-8" style={{ backgroundImage: "radial-gradient(rgba(80, 111, 255, 0.12) 1px, transparent 1px)", backgroundSize: "16px 16px" }}>
        <div className="mx-auto max-w-3xl space-y-5">
          <div className="flex items-start gap-2.5"><OrbMark small /><div className="max-w-[84%] rounded-2xl rounded-tl-md border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-700 shadow-sm"><p>Tell me what changed. I’ll identify the right work, keep it organised, and prepare the next step for your team.</p></div></div>
          {loading && !data ? <OrbLoader compact label="Opening operations" /> : error && !data ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><strong>Could not load operations.</strong><button type="button" onClick={reload} className="ml-2 font-bold underline">Try again</button></div> : updates.map((update) => <UpdateExchange key={update.id} update={update} />)}
        </div>
      </div>

      <form onSubmit={submit} className="border-t border-slate-200 bg-white p-4 sm:p-5">
        <div className={`rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 transition focus-within:border-primary/50 focus-within:bg-white focus-within:ring-4 focus-within:ring-primary/10 ${submitting ? "opacity-70" : ""}`}>
          <textarea ref={composerRef} aria-label="Operational update" value={message} onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); submit(event); } }} disabled={submitting} rows={3} placeholder="Tell Orb what changed…" className="block w-full resize-none bg-transparent text-sm leading-6 text-slate-800 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed" />
          <div className="mt-2 flex items-center justify-between gap-3"><p className="text-[11px] text-slate-400">Enter to send · Shift+Enter for a new line</p><button type="submit" aria-label="Send operational update" disabled={!message.trim() || submitting} className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-white transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-45">{submitting ? <RefreshCw size={16} className="animate-spin" /> : <ArrowUp size={18} strokeWidth={2.5} />}</button></div>
        </div>
      </form>
    </section>
  </div>;
}
