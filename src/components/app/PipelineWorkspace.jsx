import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  CheckCircle2,
  Circle,
  ExternalLink,
  Eye,
  FileText,
  Globe2,
  KeyRound,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  Square,
  Store,
  X,
  XCircle,
} from "lucide-react";
import Orb from "../Orb";
import Button from "../ui/Button";
import {
  cancelCrawl,
  cancelPipeline,
  createCrawlPipeline,
  getCrawl,
  getCrawlPageContent,
  getPipeline,
  importShopifySource,
  listPipelines,
  listCrawlPages,
  listCrawlUrls,
  pauseCrawl,
  pausePipeline,
  resumeCrawl,
  resumePipeline,
  startPipelineGeneration,
} from "../../services/orbApi";

const STORAGE_KEY = "orb_active_pipeline_v2";
const stageOrder = ["crawl", "parse", "generate", "review", "publish"];
const DISMISSED_PIPELINE_STATUSES = new Set(["cancelled", "canceled", "stopped"]);

function isDismissedPipeline(pipeline, crawl) {
  const pipelineStatus = String(pipeline?.status || "").toLowerCase();
  const crawlStatus = String(crawl?.status || "").toLowerCase();
  return DISMISSED_PIPELINE_STATUSES.has(pipelineStatus) || DISMISSED_PIPELINE_STATUSES.has(crawlStatus);
}
const stageLabels = {
  crawl: "Collect",
  parse: "Parse",
  generate: "Draft",
  review: "Review",
  publish: "Publish",
};
const outputOptions = ["sops", "faqs", "products"];

function OrbMark({ className = "" }) {
  return (
    <span className={`block shrink-0 overflow-hidden rounded-full ${className}`} aria-hidden="true">
      <Orb
        colors={["#9c43fe", "#4cc2e9", "#101499"]}
        backgroundColor="#ffffff"
        size={1.08}
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

function storageKey(brandId) {
  return brandId ? `${STORAGE_KEY}:${brandId}` : null;
}

function readSavedRun(brandId) {
  const key = storageKey(brandId);
  if (!key) return null;
  try {
    return JSON.parse(window.localStorage.getItem(key) || "null");
  } catch {
    return null;
  }
}

function saveRun(brandId, run) {
  const key = storageKey(brandId);
  if (!key) return;
  if (run) window.localStorage.setItem(key, JSON.stringify(run));
  else window.localStorage.removeItem(key);
}

function runFromPipeline(pipeline, brandName) {
  return {
    pipelineId: pipeline.id,
    crawlJobId: pipeline.crawl_job_id,
    brandId: pipeline.brand_id,
    brandName,
    kind: pipeline.source_kind === "shopify" ? "shopify" : "website",
    label: pipeline.source_url || "Brand source",
    startedAt: pipeline.created_at || Date.now(),
  };
}

function scrapeMarker(pipeline, crawl) {
  const crawlStage = (pipeline?.stages || []).find((stage) => stage.stage === "crawl");
  const source = crawlStage?.status || crawl?.status || pipeline?.status || "pending";
  const status = String(source).toLowerCase();
  const progress = crawl?.progress || {};
  const total = ["pending", "processing", "done", "failed", "skipped"].reduce(
    (sum, key) => sum + Number(progress[key] || 0),
    0,
  );
  const completed = Number(progress.done || 0) + Number(progress.failed || 0) + Number(progress.skipped || 0);
  if (status === "done") return { state: "done", label: "Scraping complete", progress: 1 };
  if (status === "failed") return { state: "failed", label: "Scraping failed" };
  if (status === "cancelled") return { state: "cancelled", label: "Scraping stopped" };
  if (status === "paused") return { state: "pending", label: "Scraping paused" };
  return { state: "running", label: "Scraping in progress", progress: total ? completed / total : undefined };
}

function ScrapeStatusMarker({ state, label, progress }) {
  const determinate = state === "running" && Number.isFinite(progress);
  const value = Math.min(1, Math.max(0, progress || 0));
  const tone = state === "done" ? "text-emerald-600" : state === "failed" ? "text-red-600" : state === "cancelled" ? "text-slate-500" : state === "pending" ? "text-amber-600" : "text-purple";
  return <div className="inline-flex items-center gap-2" role="status" aria-live="polite"><span className={`relative grid h-6 w-6 place-items-center ${tone}`}><svg viewBox="0 0 24 24" className={state === "running" && !determinate ? "animate-spin" : ""} aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" opacity=".18" /><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" pathLength="100" strokeDasharray={state === "running" ? `${Math.max(determinate ? value * 100 : 68, 8)} 100` : "100 100"} transform="rotate(-90 12 12)" /></svg>{state === "done" && <svg viewBox="0 0 24 24" className="absolute h-4 w-4" aria-hidden="true"><path d="M7.5 12.25 10.5 15.25 16.75 8.75" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" /></svg>}{state === "failed" && <svg viewBox="0 0 24 24" className="absolute h-4 w-4" aria-hidden="true"><path d="m8.5 8.5 7 7m0-7-7 7" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" /></svg>}{state === "cancelled" && <span className="absolute h-2 w-2 rounded-sm bg-current" />}{state === "pending" && <span className="absolute h-1.5 w-1.5 rounded-full bg-current" />}</span><span className={`text-xs font-bold ${tone}`}>{label}{determinate && <span className="ml-1 text-slate-500">{Math.round(value * 100)}%</span>}</span></div>;
}

function StageIcon({ status }) {
  if (status === "done")
    return <CheckCircle2 size={16} className="text-emerald-600" />;
  if (status === "failed")
    return <XCircle size={16} className="text-red-600" />;
  if (["running", "throttled"].includes(status))
    return <Loader2 size={16} className="animate-spin text-purple" />;
  return <Circle size={16} className="text-slate-300" />;
}

function StageTrack({ pipeline }) {
  const byStage = Object.fromEntries(
    (pipeline?.stages || []).map((stage) => [stage.stage, stage]),
  );
  return (
    <ol className="grid gap-2 sm:grid-cols-5">
      {stageOrder.map((name) => {
        const stage = byStage[name] || { status: "queued" };
        const isDraftGate = name === "generate" &&
          ["waiting_review", "running"].includes(stage.status) &&
          !stage.counts?.generation_job_id;
        const statusLabel = isDraftGate
          ? "Ready to draft"
          : stage.status.replaceAll("_", " ");
        return (
          <li
            key={name}
            className="rounded-lg border border-slate-200 bg-white px-3 py-3"
          >
            <div className="flex items-center gap-2">
              <StageIcon status={stage.status} />
              <span className="text-sm font-bold">{stageLabels[name]}</span>
            </div>
            <p className="mt-1 text-xs capitalize text-slate-500">
              {statusLabel}
            </p>
          </li>
        );
      })}
    </ol>
  );
}

function formatRetryTime(value) {
  if (!value) return null;
  const retryAt = new Date(value);
  if (Number.isNaN(retryAt.getTime())) return null;
  const seconds = Math.ceil((retryAt.getTime() - Date.now()) / 1000);
  if (seconds <= 0) return "Retrying now";
  if (seconds < 60) return `Retrying in ${seconds}s`;
  return `Retrying in ${Math.ceil(seconds / 60)} min`;
}

function PipelineProgress({ pipeline, crawl }) {
  const stageRows = pipeline?.stages || [];
  const stages = Object.fromEntries(
    stageRows.map((stage) => [stage.stage, String(stage.status || "queued").toLowerCase()]),
  );
  const draftStage = stageRows.find((stage) => stage.stage === "generate");
  const generationStatus = String(draftStage?.counts?.generation_status || "").toLowerCase();
  const draftReady = ["waiting_review", "running"].includes(stages.generate) &&
    !draftStage?.counts?.generation_job_id && generationStatus !== "done";
  const draftFailed = stages.generate === "failed";
  const crawlProgress = crawl?.progress || {};
  const found = ["pending", "processing", "done", "failed", "skipped"].reduce(
    (total, key) => total + Number(crawlProgress[key] || 0),
    0,
  );
  const processed = Number(crawlProgress.done || 0) + Number(crawlProgress.failed || 0) + Number(crawlProgress.skipped || 0);
  const complete = (status) => ["done", "completed", "published"].includes(status);
  const active = (status) => ["running", "throttled", "paused", "waiting_review"].includes(status);
  const firstOpen = stageOrder.findIndex((stage) => !complete(stages[stage] || "queued"));
  const activeIndex = stageOrder.findIndex((stage) => active(stages[stage] || "queued"));
  const failedIndex = stageOrder.findIndex((stage) => stages[stage] === "failed");
  const currentIndex = failedIndex >= 0 ? failedIndex : activeIndex >= 0 ? activeIndex : firstOpen >= 0 ? firstOpen : stageOrder.length - 1;
  const currentStage = stageOrder[currentIndex];
  const currentStatus = stages[currentStage] || "queued";
  const finishedCount = stageOrder.filter((stage) => complete(stages[stage] || "queued")).length;
  const currentFraction = currentStage === "crawl" && found ? Math.min(1, processed / found) : complete(currentStatus) ? 1 : 0;
  const completedShare = finishedCount / stageOrder.length;
  const value = Math.min(1, Math.max(completedShare, (currentIndex + currentFraction) / stageOrder.length));
  const determinate = (currentStage === "crawl" && found > 0) || finishedCount === stageOrder.length || draftReady || draftFailed;
  const throttled = currentStatus === "throttled" || String(pipeline?.status || crawl?.status || "").toLowerCase() === "throttled";
  const retryText = formatRetryTime(crawl?.resume_at || pipeline?.resume_at);

  let detail = "Waiting for this step to begin.";
  if (throttled) {
    detail = `The site is rate-limiting requests (HTTP 429). ${retryText || "Orb will retry automatically."}`;
  } else if (currentStatus === "paused") {
    detail = "This step is paused. Resume it when you are ready.";
  } else if (draftFailed) {
    detail = draftStage?.error || "Drafting could not finish. Check the connection and try again.";
  } else if (draftReady) {
    const pagesReady = Number(draftStage?.counts?.pages_ready || pipeline?.counts?.pages_ready || processed || 0);
    detail = `${pagesReady} cleaned source page${pagesReady === 1 ? " is" : "s are"} ready. Start drafting to create the selected content.`;
  } else if (currentStatus === "waiting_review") {
    detail = "Content is ready for review before publishing.";
  } else if (currentStage === "crawl" && found) {
    detail = `${processed} of ${found} discovered page${found === 1 ? "" : "s"} processed.`;
  } else if (currentStage === "crawl") {
    detail = "Discovering the site and waiting for the first page to be found.";
  } else if (currentStatus === "running") {
    detail = "This step is in progress.";
  }

  const baseWidth = `${Math.round(completedShare * 100)}%`;
  return (
    <section className="mt-6 rounded-lg border border-slate-200 bg-slate-50/70 p-4" aria-label="Pipeline progress">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-sm font-extrabold text-slate-800">
          {stageLabels[currentStage]} <span className="font-medium text-slate-500">{draftReady ? "ready to draft" : currentStatus.replace("_", " ")}</span>
        </p>
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Step {currentIndex + 1} of {stageOrder.length}</p>
      </div>
      <div
        className="relative mt-3 h-2 overflow-hidden rounded-full bg-slate-200"
        role="progressbar"
        aria-label={`Pipeline progress: ${stageLabels[currentStage]}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={determinate ? Math.round(value * 100) : undefined}
        aria-valuetext={determinate ? `${Math.round(value * 100)}% complete` : `${stageLabels[currentStage]} in progress`}
      >
        <span className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-purple via-indigo-500 to-sky-400 transition-[width] duration-500" style={{ width: determinate ? `${Math.max(value * 100, 4)}%` : baseWidth }} />
        {!determinate && currentStatus !== "paused" && currentStatus !== "queued" && (
          <span className="pipeline-progress__indeterminate" style={{ left: baseWidth }} aria-hidden="true" />
        )}
      </div>
      <p className={`mt-2 text-xs ${throttled ? "text-amber-700" : draftFailed ? "text-red-700" : "text-slate-500"}`} role="status" aria-live="polite">{detail}</p>
    </section>
  );
}

function DraftReadyPanel({ pipeline, onStart, starting }) {
  const draftStage = (pipeline?.stages || []).find((stage) => stage.stage === "generate");
  const counts = draftStage?.counts || pipeline?.counts || {};
  const hasJob = Boolean(counts.generation_job_id);
  const retrying = draftStage?.status === "failed";
  const ready = ["waiting_review", "running"].includes(draftStage?.status) && !hasJob;
  if (!ready && !retrying) return null;
  const outputs = (counts.outputs || pipeline?.options?.outputs || []).filter((item) => outputOptions.includes(item));
  const pagesReady = Number(counts.pages_ready || pipeline?.counts?.pages_ready || 0);
  return (
    <section className={`mt-5 rounded-xl border p-5 ${retrying ? "border-red-200 bg-red-50/50" : "border-purple/20 bg-gradient-to-br from-purple/5 via-white to-sky-50"}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-sm font-extrabold text-slate-900"><OrbMark className="h-5 w-5" /> {retrying ? "Drafting needs attention" : "Ready to draft from your source"}</p>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            {retrying
              ? draftStage?.error || "Orb could not finish creating the drafts. You can safely try again."
              : `${pagesReady ? `${pagesReady} cleaned page${pagesReady === 1 ? " is" : "s are"}` : "Your cleaned pages are"} ready. Orb will create source-grounded drafts for the selected outputs, then bring you to review.`}
          </p>
          {outputs.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{outputs.map((output) => <span key={output} className="rounded-full bg-white px-2.5 py-1 text-xs font-bold uppercase text-purple shadow-sm ring-1 ring-purple/15">{output}</span>)}</div>}
        </div>
        <Button onClick={onStart} disabled={starting || !outputs.length}>
          {starting ? <><Loader2 size={16} className="animate-spin" /> Starting drafts</> : <><OrbMark className="h-5 w-5" /> {retrying ? "Try again" : "Start drafting"}</>}
        </Button>
      </div>
      {!outputs.length && <p className="mt-3 text-xs text-amber-700">No output type was selected for this source. Start a new source and select at least one output.</p>}
    </section>
  );
}

function ReviewReadyPanel({ pipeline }) {
  const stages = Object.fromEntries((pipeline?.stages || []).map((stage) => [stage.stage, stage]));
  const draft = stages.generate;
  const review = stages.review;
  const isReady = draft?.status === "done" && review?.status === "waiting_review";
  if (!isReady) return null;

  const counts = draft?.counts || pipeline?.counts || {};
  const generated = counts.generated || {};
  const destinations = [
    { key: "sops", label: "Review SOPs", to: "/app/sops" },
    { key: "faqs", label: "Review FAQs", to: "/app/faqs" },
    { key: "products", label: "Review products", to: "/app/products" },
  ].filter((item) => Number(generated[item.key] || 0) > 0 || (pipeline?.options?.outputs || []).includes(item.key));

  return (
    <section className="mt-5 rounded-xl border border-sky-200 bg-gradient-to-br from-sky-50 via-white to-purple/5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-sm font-extrabold text-slate-900"><OrbMark className="h-5 w-5" /> Drafts are ready to review</p>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">Open each content area to review, edit, approve, or reject Orb’s source-grounded drafts before publishing.</p>
          {Object.values(generated).some((value) => Number(value) > 0) && (
            <p className="mt-2 text-xs font-semibold text-slate-500">Generated: {Number(generated.sops || 0)} SOPs · {Number(generated.faqs || 0)} FAQs · {Number(generated.products || 0)} products</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {destinations.map((destination) => (
            <Link key={destination.key} to={destination.to} className="inline-flex items-center justify-center rounded-md bg-purple px-3 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-purple/90">
              {destination.label}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function OutputPicker({ value, onChange }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {outputOptions.map((output) => {
        const selected = value.includes(output);
        return (
          <button
            type="button"
            key={output}
            onClick={() =>
              onChange(
                selected
                  ? value.filter((item) => item !== output)
                  : [...value, output],
              )
            }
            className={`rounded-lg border p-4 text-left transition-colors ${selected ? "border-purple bg-purple/5 ring-1 ring-purple" : "border-slate-200 bg-white hover:border-purple/50"}`}
          >
            <p className="font-bold uppercase">{output}</p>
            <p className="mt-1 text-xs text-slate-500">
              {output === "sops"
                ? "Operational decision flows"
                : output === "faqs"
                  ? "Customer-ready answers"
                  : "Catalog knowledge"}
            </p>
          </button>
        );
      })}
    </div>
  );
}

function SourceForm({ onStart, loading, brandName }) {
  const [kind, setKind] = useState("website");
  const [website, setWebsite] = useState("");
  const [domain, setDomain] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [maximum, setMaximum] = useState("25");
  const [outputs, setOutputs] = useState(["sops", "faqs", "products"]);
  const [error, setError] = useState("");
  const submit = async () => {
    setError("");
    if (!outputs.length) return setError("Select at least one output.");
    if (kind === "website" && !website.trim())
      return setError("Enter the website to collect.");
    if (
      kind === "shopify" &&
      Boolean(domain.trim()) !== Boolean(accessToken.trim())
    )
      return setError(
        "Enter both the Shopify domain and Admin API token, or leave both blank to use configured server credentials.",
      );
    try {
      await onStart({
        kind,
        website: website.trim(),
        domain: domain.trim(),
        accessToken: accessToken.trim(),
        maximum: Number(maximum),
        outputs,
      });
      setAccessToken("");
    } catch (cause) {
      setError(cause.message || "Could not start this source.");
    }
  };
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-7">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-purple/10 p-2 text-purple">
          <Globe2 size={20} />
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-purple">
            New source
          </p>
          <h2 className="mt-1 text-2xl font-extrabold tracking-tight">
            Build your knowledge base
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Choose how Orb should collect brand information, then follow its
            progress here.
          </p>
          {brandName && <p className="mt-2 text-xs font-bold text-purple">Adding a source for {brandName}</p>}
        </div>
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setKind("website")}
          className={`rounded-lg border p-4 text-left ${kind === "website" ? "border-purple bg-purple/5 ring-1 ring-purple" : "border-slate-200"}`}
        >
          <Globe2 size={18} className="text-purple" />
          <p className="mt-3 font-bold">Website crawl</p>
          <p className="mt-1 text-xs text-slate-500">
            Discover and collect public pages from a website.
          </p>
        </button>
        <button
          type="button"
          onClick={() => setKind("shopify")}
          className={`rounded-lg border p-4 text-left ${kind === "shopify" ? "border-purple bg-purple/5 ring-1 ring-purple" : "border-slate-200"}`}
        >
          <Store size={18} className="text-purple" />
          <p className="mt-3 font-bold">Shopify Admin API</p>
          <p className="mt-1 text-xs text-slate-500">
            Import products, pages, articles, and policies without storefront
            scraping.
          </p>
        </button>
      </div>
      <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
        {kind === "website" ? (
          <>
            <label className="text-sm font-bold">Website address</label>
            <input
              value={website}
              onChange={(event) => setWebsite(event.target.value)}
              placeholder="https://your-site.com"
              type="url"
              className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-purple focus:ring-2 focus:ring-purple/20"
            />
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 text-sm font-bold">
              <KeyRound size={16} /> Shopify Admin credentials
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Sent once to start this import. The token is not saved in Orb or
              shown again.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <input
                value={domain}
                onChange={(event) => setDomain(event.target.value)}
                placeholder="your-store.myshopify.com"
                className="rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-purple focus:ring-2 focus:ring-purple/20"
              />
              <input
                value={accessToken}
                onChange={(event) => setAccessToken(event.target.value)}
                placeholder="Admin API access token"
                type="password"
                autoComplete="off"
                className="rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-purple focus:ring-2 focus:ring-purple/20"
              />
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Leave both blank only when this store is already configured on the
              Orb server.
            </p>
          </>
        )}
      </div>
      <div className="mt-5">
        <p className="text-sm font-bold">Outputs to draft</p>
        <div className="mt-2">
          <OutputPicker value={outputs} onChange={setOutputs} />
        </div>
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <label className="text-sm text-slate-600">
          Maximum items{" "}
          <select
            value={maximum}
            onChange={(event) => setMaximum(event.target.value)}
            className="ml-2 rounded-md border border-slate-300 bg-white px-2 py-1.5 font-bold text-ink"
          >
            <option value="5">5</option>
            <option value="25">25</option>
            <option value="100">100</option>
          </select>
        </label>
        <Button onClick={submit} disabled={loading}>
          {loading ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Starting
            </>
          ) : (
            <>
              <RefreshCw size={16} />
              Start import
            </>
          )}
        </Button>
      </div>
      {error && (
        <p className="mt-4 flex gap-2 rounded-md bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle size={17} className="shrink-0" />
          {error}
        </p>
      )}
    </section>
  );
}

function ActivityTable({ run, activities, loading, onView }) {
  const isShopify = run.kind === "shopify";
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
        <div>
          <h3 className="font-extrabold">
            {isShopify ? "Imported items" : "Site activity"}
          </h3>
          <p className="mt-0.5 text-xs text-slate-500">
            {isShopify
              ? "Content received from Shopify Admin API."
              : "URLs Orb has discovered and is processing."}
          </p>
        </div>
        {loading && <Loader2 size={17} className="animate-spin text-purple" />}
      </div>
      {activities.length ? (
        <div className="max-h-80 overflow-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">Address</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Info</th>
                <th className="px-4 py-3"><span className="sr-only">View content</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {activities.map((item) => (
                <tr key={item.url} className="align-top">
                  <td className="max-w-sm px-5 py-3">
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 truncate font-medium hover:text-purple"
                    >
                      <span className="truncate">{item.title || item.url}</span>
                      <ExternalLink size={13} className="shrink-0" />
                    </a>
                  </td>
                  <td className="px-4 py-3 capitalize text-slate-600">
                    {item.page_type || "content"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-bold ${item.status === "failed" ? "bg-red-50 text-red-700" : item.status === "done" ? "bg-emerald-50 text-emerald-700" : item.status === "pending" ? "bg-amber-50 text-amber-700" : "bg-purple/10 text-purple"}`}
                    >
                      {item.status || "imported"}
                    </span>
                  </td>
                  <td className="max-w-xs px-4 py-3 text-xs text-slate-500">
                    {item.error ||
                      item.http_status ||
                      (item.text_length
                        ? `${item.text_length.toLocaleString()} characters`
                        : "—")}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => onView(item.url)}
                      disabled={!item.text_length && item.status !== "done"}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-bold hover:border-purple hover:text-purple disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Eye size={14} /> View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="px-5 py-10 text-center text-sm text-slate-500">
          <FileText size={22} className="mx-auto mb-2 text-slate-300" />
          {isShopify
            ? "Waiting for Shopify to return content."
            : "Discovery is starting. URLs will appear here shortly."}
        </div>
      )}
    </section>
  );
}

function ProgressView({ run, snapshot, refresh, reset, onControl, controlling, onStartDraft, drafting, onView }) {
  const { pipeline, crawl, activities, loading, error } = snapshot;
  const failed = activities.filter(
    (item) => item.status === "failed" || item.error,
  );
  const status = pipeline?.status || crawl?.status || "starting";
  const counts = pipeline?.counts || {};
  const scraping = scrapeMarker(pipeline, crawl);
  const rateLimited = String(status).toLowerCase() === "throttled" || /(?:http\s*)?429|rate[ -]?limit/i.test(pipeline?.error || "");
  const canControl = ["discovering", "ready", "running", "throttled"].includes(status);
  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3"><ScrapeStatusMarker {...scraping} /><span className="text-xs text-slate-500">Live pipeline</span></div>
            <h2 className="mt-3 text-xl font-extrabold">{run.label}</h2>
            <p className="mt-1 text-sm text-slate-500">
              {run.kind === "shopify"
                ? "Shopify Admin API import"
                : "Website crawl"}{" "}
              · Started {new Date(run.startedAt).toLocaleString()}
            </p>
            {run.brandName && <p className="mt-1 text-xs font-bold text-purple">Brand: {run.brandName}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            {status === "paused" ? (
              <Button variant="outline" size="sm" onClick={() => onControl("resume")} disabled={controlling}>
                <Play size={15} /> Resume
              </Button>
            ) : canControl ? (
              <Button variant="outline" size="sm" onClick={() => onControl("pause")} disabled={controlling}>
                <Pause size={15} /> Pause
              </Button>
            ) : null}
            {canControl && <Button variant="outline" size="sm" onClick={() => onControl("cancel")} disabled={controlling}><Square size={14} /> Stop</Button>}
            <Button variant="outline" size="sm" onClick={refresh}>
              <RefreshCw size={15} />
              Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={reset}>
              New source
            </Button>
          </div>
        </div>
        {pipeline?.error && !rateLimited && (
          <p className="mt-5 flex gap-2 rounded-md bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle size={17} className="shrink-0" />
            {pipeline.error}
          </p>
        )}
        {crawl && !crawl.worker_online && run.kind === "website" && (
          <p className="mt-5 flex gap-2 rounded-md bg-amber-50 p-3 text-sm text-amber-800">
            <AlertCircle size={17} className="shrink-0" />
            Worker offline. Keep the worker container running to continue this
            crawl.
          </p>
        )}
        <PipelineProgress pipeline={pipeline} crawl={crawl} />
        <div className="mt-4">
          <StageTrack pipeline={pipeline} />
        </div>
        <DraftReadyPanel pipeline={pipeline} onStart={onStartDraft} starting={drafting} />
        <ReviewReadyPanel pipeline={pipeline} />
        <div className="mt-6 grid gap-3 sm:grid-cols-4">
          <div className="rounded-lg bg-slate-50 p-4">
            <p className="text-xs font-bold uppercase text-slate-500">Found</p>
            <p className="mt-1 text-2xl font-extrabold">
              {crawl?.progress?.pending +
                crawl?.progress?.processing +
                crawl?.progress?.done +
                crawl?.progress?.failed +
                crawl?.progress?.skipped ||
                counts.pages_fetched ||
                activities.length ||
                0}
            </p>
          </div>
          <div className="rounded-lg bg-slate-50 p-4">
            <p className="text-xs font-bold uppercase text-slate-500">
              Processed
            </p>
            <p className="mt-1 text-2xl font-extrabold">
              {crawl?.progress?.done || counts.pages_parsed || 0}
            </p>
          </div>
          <div className="rounded-lg bg-slate-50 p-4">
            <p className="text-xs font-bold uppercase text-slate-500">Failed</p>
            <p className="mt-1 text-2xl font-extrabold">
              {crawl?.progress?.failed || failed.length || 0}
            </p>
          </div>
          <div className="rounded-lg bg-slate-50 p-4">
            <p className="text-xs font-bold uppercase text-slate-500">
              Throttled
            </p>
            <p className="mt-1 text-2xl font-extrabold">
              {crawl?.progress?.throttled || 0}
            </p>
          </div>
        </div>
        {crawl?.discovered_by_type && (
          <div className="mt-5 flex flex-wrap gap-2">
            {Object.entries(crawl.discovered_by_type).map(([type, count]) => (
              <span
                key={type}
                className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold capitalize text-slate-600"
              >
                {type}: {count}
              </span>
            ))}
          </div>
        )}
      </section>
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Could not refresh pipeline details: {error}
        </p>
      )}
      <ActivityTable run={run} activities={activities} loading={loading} onView={onView} />
      {failed.length > 0 && (
        <section className="rounded-xl border border-red-200 bg-white p-5">
          <h3 className="flex items-center gap-2 font-extrabold text-red-700">
            <XCircle size={18} />
            Failures needing attention
          </h3>
          <ul className="mt-3 space-y-2 text-sm">
            {failed.slice(0, 10).map((item) => (
              <li
                key={`failure-${item.url}`}
                className="rounded-md bg-red-50 px-3 py-2"
              >
                <strong className="break-all">{item.url}</strong>
                <p className="mt-1 text-red-700/80">
                  {item.error || "This URL could not be processed."}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export default function PipelineWorkspace() {
  const [brandId, setBrandId] = useState(() => window.localStorage.getItem("orb_selected_brand") || "");
  const [brandName, setBrandName] = useState(() => window.localStorage.getItem("orb_selected_brand_name") || "");
  const [run, setRun] = useState(null);
  const [starting, setStarting] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [controlling, setControlling] = useState(false);
  const [content, setContent] = useState(null);
  const [snapshot, setSnapshot] = useState({
    pipeline: null,
    crawl: null,
    activities: [],
    loading: false,
    error: "",
  });
  const clearSnapshot = useCallback(() => {
    setContent(null);
    setSnapshot({ pipeline: null, crawl: null, activities: [], loading: false, error: "" });
  }, []);
  useEffect(() => {
    const onBrandChange = () => {
      setBrandId(window.localStorage.getItem("orb_selected_brand") || "");
      setBrandName(window.localStorage.getItem("orb_selected_brand_name") || "");
    };
    window.addEventListener("orb:brand-changed", onBrandChange);
    return () => window.removeEventListener("orb:brand-changed", onBrandChange);
  }, []);
  useEffect(() => {
    let active = true;
    clearSnapshot();
    setRun(null);
    if (!brandId) return () => { active = false; };
    const saved = readSavedRun(brandId);
    if (saved?.brandId === brandId) setRun(saved);
    const loadBrandPipeline = async () => {
      try {
        const result = await listPipelines(brandId);
        const latest = result?.pipelines?.[0];
        if (!active || !latest) return;
        if (isDismissedPipeline(latest)) {
          saveRun(brandId, null);
          setRun(null);
          clearSnapshot();
          return;
        }
        const next = runFromPipeline(latest, brandName);
        saveRun(brandId, next);
        setRun(next);
      } catch {
        // A saved, brand-scoped run remains usable if the API is temporarily offline.
      }
    };
    loadBrandPipeline();
    return () => { active = false; };
  }, [brandId, brandName, clearSnapshot]);
  const refresh = useCallback(async () => {
    if (!run?.pipelineId || !run?.crawlJobId) return;
    setSnapshot((current) => ({ ...current, loading: true, error: "" }));
    try {
      const [pipelineResult, crawlResult] = await Promise.all([
        getPipeline(run.pipelineId),
        getCrawl(run.crawlJobId),
      ]);
      const activityResult =
        run.kind === "shopify"
          ? await listCrawlPages(run.crawlJobId)
          : await listCrawlUrls(run.crawlJobId);
      if (isDismissedPipeline(pipelineResult.pipeline, crawlResult)) {
        saveRun(run.brandId, null);
        setRun(null);
        clearSnapshot();
        return;
      }
      setSnapshot({
        pipeline: pipelineResult.pipeline,
        crawl: crawlResult,
        activities: activityResult.items || [],
        loading: false,
        error: "",
      });
    } catch (cause) {
      setSnapshot((current) => ({
        ...current,
        loading: false,
        error: cause.message || "Unknown error",
      }));
    }
  }, [run, clearSnapshot]);
  useEffect(() => {
    if (!run) return undefined;
    refresh();
    const id = window.setInterval(refresh, 3000);
    return () => window.clearInterval(id);
  }, [run, refresh]);
  const start = async ({
    kind,
    website,
    domain,
    accessToken,
    maximum,
    outputs,
  }) => {
    if (!brandId) throw new Error("Choose a brand from the top bar before adding a source.");
    setStarting(true);
    try {
      let next;
      if (kind === "shopify") {
        const result = await importShopifySource({
          domain,
          accessToken,
          brandId,
          maximum,
          outputs,
        });
        next = {
          pipelineId: result.pipeline_id,
          crawlJobId: result.crawl_job_id,
          brandId,
          brandName,
          kind,
          label: result.domain || domain || "Configured Shopify store",
          startedAt: Date.now(),
        };
      } else {
        const job = await createCrawlPipeline({
          url: website,
          brandId,
          maxPages: maximum,
          outputs,
        });
        next = {
          pipelineId: job.options.pipeline_id,
          crawlJobId: job.id,
          brandId,
          brandName,
          kind,
          label: website,
          startedAt: Date.now(),
        };
      }
      saveRun(brandId, next);
      setRun(next);
    } finally {
      setStarting(false);
    }
  };
  const reset = () => {
    saveRun(brandId, null);
    setRun(null);
    clearSnapshot();
  };
  const control = async (action) => {
    setControlling(true);
    try {
      if (action === "pause") await (run.pipelineId ? pausePipeline(run.pipelineId) : pauseCrawl(run.crawlJobId));
      if (action === "resume") await (run.pipelineId ? resumePipeline(run.pipelineId) : resumeCrawl(run.crawlJobId));
      if (action === "cancel") {
        await (run.pipelineId ? cancelPipeline(run.pipelineId) : cancelCrawl(run.crawlJobId));
        // Cancelled crawls cannot be resumed. Remove the inactive card rather
        // than leaving a dead run as the dashboard's active workspace.
        reset();
        return;
      }
      await refresh();
    } catch (cause) {
      setSnapshot((current) => ({ ...current, error: cause.message || "Could not update this crawl." }));
    } finally {
      setControlling(false);
    }
  };
  const startDrafting = async () => {
    if (!run?.pipelineId) return;
    setDrafting(true);
    try {
      await startPipelineGeneration(run.pipelineId);
      await refresh();
    } catch (cause) {
      setSnapshot((current) => ({ ...current, error: cause.message || "Could not start drafting." }));
    } finally {
      setDrafting(false);
    }
  };
  const viewContent = async (url) => {
    setContent({ loading: true });
    try {
      setContent({ loading: false, ...(await getCrawlPageContent(run.crawlJobId, url)) });
    } catch (cause) {
      setContent({ loading: false, error: cause.message || "Scraped content is unavailable." });
    }
  };
  return (
    <div className="mx-auto max-w-6xl">
      {run ? (
        <ProgressView
          run={run}
          snapshot={snapshot}
          refresh={refresh}
          reset={reset}
          onControl={control}
          controlling={controlling}
          onStartDraft={startDrafting}
          drafting={drafting}
          onView={viewContent}
        />
      ) : (
        <SourceForm onStart={start} loading={starting} brandName={brandName} />
      )}
      {content && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4"><section className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-xl bg-white shadow-xl"><header className="flex items-start justify-between border-b border-slate-200 px-5 py-4"><div><p className="text-xs font-bold uppercase tracking-widest text-purple">Scraped content</p><h3 className="mt-1 break-all font-extrabold">{content.title || content.url || "Loading"}</h3></div><button type="button" aria-label="Close content" onClick={() => setContent(null)}><X size={20} /></button></header><div className="overflow-auto px-5 py-4"><p className="mb-4 break-all text-xs text-slate-500">{content.url}</p>{content.loading ? <Loader2 className="animate-spin text-purple" /> : content.error ? <p className="text-sm text-red-700">{content.error}</p> : <pre className="whitespace-pre-wrap font-sans text-sm leading-6 text-slate-700">{content.text}</pre>}</div></section></div>}
    </div>
  );
}
