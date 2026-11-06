import React, { useEffect, useState } from "react";
import { BellRing, ClipboardCheck, ExternalLink, PackageSearch, RefreshCw, Send, Sparkles } from "lucide-react";
import Button from "../components/ui/Button";
import EmptyState from "../components/ui/EmptyState";
import OrbLoader from "../components/ui/OrbLoader";
import Textarea from "../components/ui/Textarea";
import useAsync from "../hooks/useAsync";
import { activeBrandName, createOperationalUpdate, hasOrbApi, listOperationalUpdates } from "../services/orbApi";
import { useToast } from "../context/ToastContext";
import { Link } from "react-router-dom";

const typeDetails = {
  cs_update: {
    label: "CS Update",
    Icon: ClipboardCheck,
    chip: "bg-sky-100 text-sky-800",
    description: "Customer-facing change, promotion, policy, or support instruction.",
  },
  product_update: {
    label: "Product Update",
    Icon: PackageSearch,
    chip: "bg-violet-100 text-violet-800",
    description: "Product, variant, stock, preorder, price, or metafield change.",
  },
};

const formatDate = (value) => {
  if (!value) return "Just now";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Just now";
  return new Intl.DateTimeFormat(undefined, { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
};

function UpdateCard({ update }) {
  const details = typeDetails[update.classification] || typeDetails.cs_update;
  const { Icon } = details;
  const actions = Array.isArray(update.action_plan) ? update.action_plan : [];
  return <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary-tint text-primary"><Icon size={19} /></span>
        <div>
          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-extrabold ${details.chip}`}>{details.label}</span>
          <p className="mt-1 text-xs text-slate-500">Recorded {formatDate(update.created_at)}</p>
        </div>
      </div>
      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold capitalize text-slate-600">{String(update.status || "recorded").replace(/_/g, " ")}</span>
    </div>
    <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-800">{update.message}</p>
    {actions.length > 0 && <div className="mt-4 grid gap-2 border-t border-slate-100 pt-4">
      {actions.map((action, index) => <div key={`${action.label}-${index}`} className="flex items-start gap-2 text-xs text-slate-600"><Sparkles size={14} className="mt-0.5 shrink-0 text-primary" /><span><strong className="text-slate-700">{action.system}:</strong> {action.label}</span></div>)}
    </div>}
    {update.classification === "product_update" && <Link to="/app/products" className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline">Review products in Shopify library <ExternalLink size={13} /></Link>}
  </article>;
}

export default function Operations() {
  const { showToast } = useToast();
  const [message, setMessage] = useState("");
  const [brandVersion, setBrandVersion] = useState(0);
  const [submitting, setSubmitting] = useState(false);
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

  const submit = async (event) => {
    event.preventDefault();
    const content = message.trim();
    if (content.length < 8) {
      showToast("Add a little more detail so Orb can classify the update.", "error");
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
      const label = typeDetails[result?.update?.classification]?.label || "Operational update";
      showToast(`${label} recorded.`);
    } catch (submitError) {
      showToast(submitError.message || "Could not record this update.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  return <div className="page-enter mx-auto max-w-6xl">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-xs font-extrabold uppercase tracking-widest text-primary">Brand operations</p>
        <h2 className="mt-1 text-3xl font-extrabold tracking-tight">Operations</h2>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">Share a change for {activeBrandName() || "your brand"}. Orb records it and classifies the operational follow-up.</p>
      </div>
      <button type="button" onClick={reload} disabled={loading || refreshing} className="inline-flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-primary"><RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />Refresh</button>
    </header>

    <section className="mt-6 grid gap-4 md:grid-cols-2">
      {Object.entries(typeDetails).map(([key, details]) => {
        const { Icon } = details;
        return <div key={key} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><span className="grid h-10 w-10 place-items-center rounded-xl bg-primary-tint text-primary"><Icon size={19} /></span><h3 className="mt-4 font-extrabold text-slate-900">{details.label}</h3><p className="mt-1 text-sm leading-6 text-slate-600">{details.description}</p></div>;
      })}
    </section>

    <section className="mt-6 rounded-xl border border-primary/25 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-primary-tint text-primary"><BellRing size={19} /></span><div><h3 className="font-extrabold text-slate-900">What changed?</h3><p className="text-sm text-slate-600">Describe the update in plain language. Orb will classify it automatically.</p></div></div>
      <form className="mt-5" onSubmit={submit}>
        <Textarea aria-label="Operational update" value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Example: We will have a flat 50% off sale from 10–15 November." className="[&_textarea]:min-h-32 [&_textarea]:border-slate-200 [&_textarea]:bg-slate-50 [&_textarea]:font-normal" />
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-slate-500">Product updates are queued for a Shopify review; Orb will not change products or metafields without a confirmed action.</p><Button type="submit" disabled={submitting}>{submitting ? <RefreshCw size={16} className="animate-spin" /> : <Send size={16} />}{submitting ? "Recording…" : "Record update"}</Button></div>
      </form>
    </section>

    <section className="mt-8">
      <div className="flex items-center justify-between gap-3"><div><h3 className="text-xl font-extrabold tracking-tight">Recent updates</h3><p className="mt-1 text-sm text-slate-600">A shared history for this brand.</p></div><span className="rounded-full bg-primary-tint px-2.5 py-1 text-xs font-extrabold text-primary">{updates.length}</span></div>
      {loading && !data ? <OrbLoader label="Loading operations" /> : error && !data ? <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700"><strong>Could not load operations.</strong><p className="mt-1">{error.message || "Try again in a moment."}</p><Button size="sm" className="mt-4" onClick={reload}>Try again</Button></div> : updates.length ? <div className="mt-5 grid gap-4">{updates.map((update) => <UpdateCard key={update.id} update={update} />)}</div> : <div className="mt-5"><EmptyState title="No operational updates yet." action="Write an update above" onAction={() => window.scrollTo({ top: 0, behavior: "smooth" })} /></div>}
    </section>
  </div>;
}
