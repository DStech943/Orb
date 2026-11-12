import React, { useEffect, useState } from "react";
import { Check, Mail, Mic, MicOff, Plus, RefreshCw, Save, Trash2, Upload } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import Avatar from "../components/ui/Avatar";
import Button from "../components/ui/Button";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import Input from "../components/ui/Input";
import Modal from "../components/ui/Modal";
import Select from "../components/ui/Select";
import StatusChip from "../components/ui/StatusChip";
import Tabs from "../components/ui/Tabs";
import Textarea from "../components/ui/Textarea";
import SourcePicker from "../components/app/SourcePicker";
import BrandCategorySetup from "../components/app/BrandCategorySetup";
import useAsync from "../hooks/useAsync";
import {
  addSource,
  deleteProduct,
  listProducts,
  listSources,
  removeSource,
  saveProduct,
  seedSampleData,
} from "../services/generation";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { isOrbVoiceWakeEnabled, ORB_VOICE_WAKE_EVENT, ORB_VOICE_WAKE_STATUS_EVENT, setOrbVoiceWakeEnabled, supportsOrbVoiceWake } from "../lib/orbVoiceWake";
import { listBrands, invalidateBrandCache } from "../services/brands";
import { getRemoteBrandAgentConnection, listBrandAgentFeedback, setRemoteBrandAgentConnection, updateBrandAgentFeedback } from "../services/orbApi";

const tabs = [
  { id: "profile", label: "Profile" },
  { id: "team", label: "Team" },
  { id: "billing", label: "Billing" },
];
const team = [
  { name: "Keith Fernandes", email: "keith@example.com", role: "Admin" },
];
const setupGuideSteps = [
  "Add a knowledge source",
  "Generate your first drafts",
  "Review a draft",
  "Publish your first SOP or FAQ",
  "Create your first flow",
  "Connect Shopify when your brand uses it",
];
const feedbackDate = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown date" : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
};

export default function Settings() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [params, setParams] = useSearchParams();
  const active = params.get("tab") || "profile";
  const setupGuideOpen = params.get("setupGuide") === "1";
  const [dirty, setDirty] = useState(false);
  const [profile, setProfile] = useState({
    name: user?.name || "",
    email: user?.email || "",
    password: "",
  });
  const [business, setBusiness] = useState({
    name: "",
    website: "",
    industry: "Software",
    support: "",
    timezone: "Asia/Kolkata",
    language: "English",
  });
  const [voice, setVoice] = useState({
    tone: "Friendly",
    doSay: "",
    dontSay: "",
    signoff: "Best,",
  });
  const [productModal, setProductModal] = useState(false);
  const [product, setProduct] = useState({
    name: "",
    price: "",
    url: "",
    description: "",
  });
  const [inviteOpen, setInviteOpen] = useState(false);
  const [deleteAccount, setDeleteAccount] = useState(false);
  const [voiceWakeEnabled, setVoiceWakeEnabled] = useState(isOrbVoiceWakeEnabled);
  const [voiceWakeSaving, setVoiceWakeSaving] = useState(false);
  const [voiceWakeStatus, setVoiceWakeStatus] = useState("off");
  const [agentBrands, setAgentBrands] = useState([]);
  const [agentBrandId, setAgentBrandId] = useState("");
  const [agentConnection, setAgentConnection] = useState({
    ai_agent_name: "",
    ai_support_agent_url: "",
    gateway_secret: "",
    control_token: "",
    clear_gateway_secret: false,
    clear_control_token: false,
    gateway_secret_configured: false,
    control_token_configured: false,
  });
  const [agentLoading, setAgentLoading] = useState(false);
  const [agentSaving, setAgentSaving] = useState(false);
  const [agentError, setAgentError] = useState("");
  const [feedbackBrands, setFeedbackBrands] = useState([]);
  const [feedbackBrandId, setFeedbackBrandId] = useState("");
  const [feedbackItems, setFeedbackItems] = useState([]);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackError, setFeedbackError] = useState("");
  const [feedbackUpdatingId, setFeedbackUpdatingId] = useState("");
  const products = useAsync(listProducts, []);
  const sources = useAsync(listSources, []);
  const visibleTabs = user?.role === "admin" ? [...tabs, { id: "agents", label: "AI agents" }, { id: "feedback", label: "AI feedback" }] : tabs;
  useEffect(() => {
    const warn = (event) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => {
    const onVoiceWakeChange = (event) => setVoiceWakeEnabled(Boolean(event.detail?.enabled));
    const onVoiceWakeStatus = (event) => setVoiceWakeStatus(event.detail?.status || "off");
    window.addEventListener(ORB_VOICE_WAKE_EVENT, onVoiceWakeChange);
    window.addEventListener(ORB_VOICE_WAKE_STATUS_EVENT, onVoiceWakeStatus);
    return () => {
      window.removeEventListener(ORB_VOICE_WAKE_EVENT, onVoiceWakeChange);
      window.removeEventListener(ORB_VOICE_WAKE_STATUS_EVENT, onVoiceWakeStatus);
    };
  }, []);
  useEffect(() => {
    if (active !== "agents" || user?.role !== "admin") return undefined;
    let cancelled = false;
    setAgentLoading(true);
    setAgentError("");
    listBrands()
      .then((brands) => {
        if (cancelled) return;
        const next = Array.isArray(brands) ? brands : [];
        setAgentBrands(next);
        setAgentBrandId((current) => current || next[0]?.id || "");
      })
      .catch((error) => !cancelled && setAgentError(error.message || "Could not load brands."))
      .finally(() => !cancelled && setAgentLoading(false));
    return () => { cancelled = true; };
  }, [active, user?.role]);
  useEffect(() => {
    if (active !== "agents" || !agentBrandId || user?.role !== "admin") return undefined;
    let cancelled = false;
    setAgentLoading(true);
    setAgentError("");
    getRemoteBrandAgentConnection(agentBrandId)
      .then((result) => {
        if (cancelled) return;
        const connection = result?.connection || {};
        setAgentConnection({
          ai_agent_name: connection.ai_agent_name || "",
          ai_support_agent_url: connection.ai_support_agent_url || "",
          gateway_secret: "",
          control_token: "",
          clear_gateway_secret: false,
          clear_control_token: false,
          gateway_secret_configured: Boolean(connection.gateway_secret_configured),
          control_token_configured: Boolean(connection.control_token_configured),
        });
      })
      .catch((error) => !cancelled && setAgentError(error.message || "Could not load this agent connection."))
      .finally(() => !cancelled && setAgentLoading(false));
    return () => { cancelled = true; };
  }, [active, agentBrandId, user?.role]);
  useEffect(() => {
    if (active !== "feedback" || user?.role !== "admin") return undefined;
    let cancelled = false;
    setFeedbackLoading(true);
    setFeedbackError("");
    listBrands()
      .then((brands) => {
        if (cancelled) return;
        const next = Array.isArray(brands) ? brands : [];
        setFeedbackBrands(next);
        setFeedbackBrandId((current) => current || next[0]?.id || "");
      })
      .catch((error) => !cancelled && setFeedbackError(error.message || "Could not load brands."))
      .finally(() => !cancelled && setFeedbackLoading(false));
    return () => { cancelled = true; };
  }, [active, user?.role]);
  const loadFeedback = async (brandId = feedbackBrandId) => {
    if (!brandId) return;
    setFeedbackLoading(true);
    setFeedbackError("");
    try {
      const result = await listBrandAgentFeedback(brandId);
      setFeedbackItems(Array.isArray(result?.feedback) ? result.feedback : []);
    } catch (error) {
      setFeedbackError(error.message || "Could not load AI feedback.");
    } finally {
      setFeedbackLoading(false);
    }
  };
  useEffect(() => {
    if (active === "feedback" && feedbackBrandId && user?.role === "admin") loadFeedback(feedbackBrandId);
  }, [active, feedbackBrandId, user?.role]);
  const tabChange = (next) => {
    if (dirty && !window.confirm("You have unsaved changes. Leave this tab?"))
      return;
    setDirty(false);
    setParams({ tab: next });
  };
  const closeSetupGuide = () => setParams({ tab: active });
  const save = () => {
    setDirty(false);
    showToast("Settings saved.");
  };
  const saveAgentConnection = async () => {
    if (!agentBrandId) return;
    setAgentSaving(true);
    setAgentError("");
    try {
      const result = await setRemoteBrandAgentConnection(agentBrandId, {
        ai_agent_name: agentConnection.ai_agent_name,
        ai_support_agent_url: agentConnection.ai_support_agent_url,
        gateway_secret: agentConnection.gateway_secret || undefined,
        control_token: agentConnection.control_token || undefined,
        clear_gateway_secret: agentConnection.clear_gateway_secret,
        clear_control_token: agentConnection.clear_control_token,
      });
      const connection = result?.connection || {};
      setAgentConnection((current) => ({
        ...current,
        gateway_secret: "",
        control_token: "",
        clear_gateway_secret: false,
        clear_control_token: false,
        gateway_secret_configured: Boolean(connection.gateway_secret_configured),
        control_token_configured: Boolean(connection.control_token_configured),
      }));
      invalidateBrandCache();
      window.dispatchEvent(new Event("orb:brand-changed"));
      showToast("AI agent connection saved.");
    } catch (error) {
      setAgentError(error.message || "Could not save this agent connection.");
    } finally {
      setAgentSaving(false);
    }
  };
  const updateFeedbackStatus = async (item, status) => {
    if (!feedbackBrandId || feedbackUpdatingId) return;
    setFeedbackUpdatingId(item.id);
    try {
      const result = await updateBrandAgentFeedback(feedbackBrandId, item.id, { status });
      if (result?.feedback) setFeedbackItems((items) => items.map((current) => current.id === item.id ? result.feedback : current));
      showToast(status === "resolved" ? "Feedback marked resolved." : "Feedback reopened.");
    } catch (error) {
      showToast(error.message || "Could not update feedback.", "error");
    } finally {
      setFeedbackUpdatingId("");
    }
  };
  const add = async (source) => {
    await addSource(source);
    sources.reload();
    showToast("Source added.");
  };
  const remove = async (id) => {
    await removeSource(id);
    sources.reload();
    showToast("Source removed.");
  };
  const saveNewProduct = async (event) => {
    event.preventDefault();
    await saveProduct(product);
    setProductModal(false);
    setProduct({ name: "", price: "", url: "", description: "" });
    products.reload();
    showToast("Product saved.");
  };
  const toggleVoiceWake = async () => {
    if (voiceWakeEnabled) {
      setOrbVoiceWakeEnabled(false);
      setVoiceWakeEnabled(false);
      setVoiceWakeStatus("off");
      showToast("Hey Orb voice activation turned off.");
      return;
    }
    if (!supportsOrbVoiceWake()) {
      showToast("Voice activation is not supported by this browser. Use Chrome or Edge.", "error");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      showToast("This browser cannot request microphone access.", "error");
      return;
    }
    setVoiceWakeSaving(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      stream.getTracks().forEach((track) => track.stop());
      setOrbVoiceWakeEnabled(true);
      setVoiceWakeEnabled(true);
      setVoiceWakeStatus("starting");
      showToast("Hey Orb is ready. Say “Hey Orb” while this tab is open.");
    } catch {
      showToast("Microphone permission is required to enable Hey Orb.", "error");
    } finally {
      setVoiceWakeSaving(false);
    }
  };
  return (
    <div className="mx-auto max-w-6xl">
      <p className="text-xs font-extrabold uppercase tracking-widest text-purple">
        Account setup
      </p>
      <h2 className="mt-1 text-3xl font-extrabold tracking-tight">Settings</h2>
      <section className="mt-6 rounded-lg border-2 border-ink bg-white shadow-brutal">
        <Tabs tabs={visibleTabs} active={active} onChange={tabChange} />
        <div className="p-5 sm:p-6">
          {active === "profile" && (
            <div className="grid max-w-xl gap-4">
              <div className="flex items-center gap-4">
                <Avatar name={profile.name} src={user?.avatar} sources={user?.avatarSources} className="h-14 w-14" />
                <p className="text-sm text-muted">
                  Your profile photo is synced from your Orb account when one is available.
                </p>
              </div>
              <Input
                label="Full name"
                value={profile.name}
                onChange={(event) => {
                  setProfile({ ...profile, name: event.target.value });
                  setDirty(true);
                }}
              />
              <Input label="Email address" readOnly value={profile.email} />
              <Input
                label="New password"
                type="password"
                value={profile.password}
                onChange={(event) => {
                  setProfile({ ...profile, password: event.target.value });
                  setDirty(true);
                }}
              />
              <Button variant="purple" onClick={save}>
                <Save size={16} />
                Save profile
              </Button>
              <button type="button" onClick={() => setParams({ tab: "profile", setupGuide: "1" })} className="w-fit text-xs font-extrabold text-primary hover:underline">Setup guide</button>
              <section className="mt-3 rounded-xl border border-primary/15 bg-primary-tint/35 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-primary">
                      {voiceWakeEnabled ? <Mic size={16} /> : <MicOff size={16} />}
                      <p className="text-xs font-extrabold uppercase tracking-wider">Voice activation</p>
                    </div>
                    <h3 className="mt-1 font-extrabold text-ink">Wake Orb with your voice</h3>
                    <p className="mt-1 text-sm text-muted">Say “Hey Orb” to open the page guide on supported browsers. It pauses when the tab is hidden and is unavailable in the flow builder.</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={voiceWakeEnabled}
                    aria-label="Enable Hey Orb voice activation"
                    disabled={voiceWakeSaving}
                    onClick={toggleVoiceWake}
                    className={`relative mt-1 inline-flex h-7 w-12 shrink-0 items-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2 ${voiceWakeEnabled ? "bg-primary" : "bg-slate-300"} disabled:cursor-wait disabled:opacity-60`}
                  >
                    <span className={`absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${voiceWakeEnabled ? "translate-x-5" : "translate-x-0"}`} />
                  </button>
                </div>
                <p className="mt-3 border-t border-primary/10 pt-3 text-xs text-muted">{voiceWakeEnabled && voiceWakeStatus === "listening" ? "Listening for “Hey Orb” while this app tab is visible." : voiceWakeEnabled && voiceWakeStatus === "starting" ? "Starting your microphone…" : voiceWakeEnabled && voiceWakeStatus === "retrying" ? "Reconnecting to speech recognition…" : voiceWakeEnabled && voiceWakeStatus === "paused" ? "Paused until you return to an eligible app page." : voiceWakeStatus === "permission-denied" ? "Microphone access was denied, so voice activation has been turned off." : voiceWakeStatus === "microphone-unavailable" ? "No microphone is available, so voice activation has been turned off." : voiceWakeStatus === "unsupported" ? "This browser does not support voice activation, so it has been turned off." : voiceWakeStatus === "connection-error" ? "Speech recognition could not connect. Orb will retry while this tab stays open." : voiceWakeEnabled ? "Preparing voice activation for this browser…" : "Off by default. Enabling it requests microphone permission and saves the choice only in this browser."}</p>
              </section>
              <div className="mt-8 border-t border-red-200 pt-5">
                <h3 className="font-extrabold text-red-700">Danger zone</h3>
                <p className="mt-1 text-sm text-muted">
                  Permanently delete this account and its local data.
                </p>
                <Button
                  variant="dark"
                  className="mt-3"
                  onClick={() => setDeleteAccount(true)}
                >
                  Delete account
                </Button>
              </div>
            </div>
          )}
          {active === "business" && (
            <>
              <BrandCategorySetup isAdmin={user?.role === "admin"} />
              <div className="grid max-w-xl gap-4">
              <Input
                label="Business or brand name"
                value={business.name}
                onChange={(event) => {
                  setBusiness({ ...business, name: event.target.value });
                  setDirty(true);
                }}
              />
              <Input
                label="Website URL"
                value={business.website}
                onChange={(event) => {
                  setBusiness({ ...business, website: event.target.value });
                  setDirty(true);
                }}
              />
              <Select
                label="Industry"
                value={business.industry}
                onChange={(event) => {
                  setBusiness({ ...business, industry: event.target.value });
                  setDirty(true);
                }}
              >
                <option>Software</option>
                <option>Retail</option>
                <option>Professional services</option>
                <option>Education</option>
              </Select>
              <Input
                label="Support email"
                value={business.support}
                onChange={(event) => {
                  setBusiness({ ...business, support: event.target.value });
                  setDirty(true);
                }}
              />
              <Select
                label="Timezone"
                value={business.timezone}
                onChange={(event) =>
                  setBusiness({ ...business, timezone: event.target.value })
                }
              >
                <option>Asia/Kolkata</option>
                <option>UTC</option>
                <option>America/New_York</option>
              </Select>
              <Button variant="purple" onClick={save}>
                Save business
              </Button>
              </div>
            </>
          )}
          {active === "voice" && (
            <div className="grid max-w-2xl gap-4">
              <Select
                label="Tone"
                value={voice.tone}
                onChange={(event) => {
                  setVoice({ ...voice, tone: event.target.value });
                  setDirty(true);
                }}
              >
                <option>Friendly</option>
                <option>Professional</option>
                <option>Playful</option>
                <option>Direct</option>
              </Select>
              <Textarea
                label="Words or phrases to use"
                value={voice.doSay}
                onChange={(event) => {
                  setVoice({ ...voice, doSay: event.target.value });
                  setDirty(true);
                }}
              />
              <Textarea
                label="Words or phrases to avoid"
                value={voice.dontSay}
                onChange={(event) => {
                  setVoice({ ...voice, dontSay: event.target.value });
                  setDirty(true);
                }}
              />
              <Input
                label="Sign-off"
                value={voice.signoff}
                onChange={(event) => {
                  setVoice({ ...voice, signoff: event.target.value });
                  setDirty(true);
                }}
              />
              <div className="rounded-lg border border-ink/20 bg-peach p-4 text-sm">
                <strong>Sample reply</strong>
                <p className="mt-2">
                  Hi there — I can help with that. {voice.signoff}
                </p>
              </div>
              <Button variant="purple" onClick={save}>
                Save brand voice
              </Button>
            </div>
          )}
          {active === "products" && (
            <div>
              <div className="flex flex-wrap justify-between gap-3">
                <div>
                  <h3 className="text-xl font-extrabold">Product catalog</h3>
                  <p className="text-sm text-muted">
                    Generated products appear here for correction.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline">
                    <Upload size={15} />
                    Import CSV
                  </Button>
                  <Button
                    variant="purple"
                    onClick={() => setProductModal(true)}
                  >
                    <Plus size={15} />
                    Add product
                  </Button>
                </div>
              </div>
              <div className="mt-5 overflow-x-auto rounded-lg border border-ink/20">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-ink/20 text-xs uppercase">
                      <th className="p-3">Name</th>
                      <th>Price</th>
                      <th>URL</th>
                      <th>Description</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {products.data?.map((item) => (
                      <tr key={item.id} className="border-b border-ink/10">
                        <td className="p-3 font-bold">{item.name}</td>
                        <td>{item.price}</td>
                        <td className="max-w-36 truncate">{item.url}</td>
                        <td>{item.description}</td>
                        <td>
                          <button
                            onClick={async () => {
                              await deleteProduct(item.id);
                              products.reload();
                            }}
                            aria-label={`Delete ${item.name}`}
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {active === "sources" && (
            <div>
              <div className="flex flex-wrap justify-between gap-3">
                <div>
                  <h3 className="text-xl font-extrabold">Sources</h3>
                  <p className="text-sm text-muted">
                    Websites, files, and pasted text used by Orb.
                  </p>
                </div>
                <button
                  className="text-sm font-bold underline"
                  onClick={async () => {
                    await seedSampleData();
                    sources.reload();
                    showToast("Sample data loaded.");
                  }}
                >
                  Load sample data
                </button>
              </div>
              <div className="mt-5">
                <SourcePicker
                  sources={sources.data || []}
                  onAdd={add}
                  onRemove={remove}
                />
              </div>
            </div>
          )}
          {active === "team" && (
            <div>
              <div className="flex justify-between">
                <div>
                  <h3 className="text-xl font-extrabold">Team</h3>
                  <p className="text-sm text-muted">
                    Invite teammates to help review generated content.
                  </p>
                </div>
                <Button variant="purple" onClick={() => setInviteOpen(true)}>
                  <Mail size={15} />
                  Invite
                </Button>
              </div>
              <div className="mt-5 divide-y border-y">
                {team.map((member) => (
                  <div
                    key={member.email}
                    className="flex items-center justify-between py-3"
                  >
                    <div>
                      <strong>{member.name}</strong>
                      <p className="text-xs text-muted">{member.email}</p>
                    </div>
                    <StatusChip status="Admin" />
                  </div>
                ))}
              </div>
            </div>
          )}
          {active === "agents" && user?.role === "admin" && (
            <div className="grid max-w-2xl gap-5">
              <div>
                <h3 className="text-xl font-extrabold">Brand AI agents</h3>
                <p className="mt-1 text-sm text-muted">
                  Connect each brand to its deployed support agent. Secrets are write-only and are never shown in Orb after saving.
                </p>
              </div>
              <Select
                label="Configure brand"
                value={agentBrandId}
                disabled={agentLoading && !agentBrandId}
                onChange={(event) => setAgentBrandId(event.target.value)}
              >
                {!agentBrands.length && <option value="">No brands available</option>}
                {agentBrands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
              </Select>
              {agentError && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{agentError}</p>}
              {agentBrandId && (
                <div className="grid gap-4 rounded-xl border border-primary/15 bg-primary-tint/20 p-4 sm:p-5">
                  <Input
                    label="Agent display name"
                    placeholder="e.g. Nutrova AI"
                    value={agentConnection.ai_agent_name}
                    onChange={(event) => setAgentConnection((current) => ({ ...current, ai_agent_name: event.target.value }))}
                  />
                  <Input
                    label="Deployed agent URL"
                    type="url"
                    placeholder="https://your-agent.up.railway.app"
                    value={agentConnection.ai_support_agent_url}
                    onChange={(event) => setAgentConnection((current) => ({ ...current, ai_support_agent_url: event.target.value }))}
                  />
                  <p className="-mt-2 text-xs text-muted">Orb sends test chats to <code>/api/widget/chat</code> on this HTTPS URL.</p>
                  <div className="grid gap-3 rounded-lg border border-ink/10 bg-white/70 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                      <p className="text-sm font-extrabold">Gateway secret</p>
                      <p className="mt-1 text-xs text-muted">{agentConnection.gateway_secret_configured ? "A secret is already stored. Enter a new value only to replace it." : "Required if this agent protects its chat endpoint with x-gateway-secret."}</p>
                      </div>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-extrabold ${agentConnection.gateway_secret_configured ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{agentConnection.gateway_secret_configured ? "Configured" : "Not configured"}</span>
                    </div>
                    <Input
                      label=""
                      type="password"
                      autoComplete="new-password"
                      placeholder={agentConnection.gateway_secret_configured ? "•••••••••••• (stored)" : "Paste the agent GATEWAY_SECRET"}
                      value={agentConnection.gateway_secret}
                      disabled={agentConnection.clear_gateway_secret}
                      onChange={(event) => setAgentConnection((current) => ({ ...current, gateway_secret: event.target.value }))}
                    />
                    {agentConnection.gateway_secret_configured && <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={agentConnection.clear_gateway_secret} onChange={(event) => setAgentConnection((current) => ({ ...current, clear_gateway_secret: event.target.checked }))} /> Remove the saved gateway secret</label>}
                  </div>
                  <div className="grid gap-3 rounded-lg border border-ink/10 bg-white/70 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                      <p className="text-sm font-extrabold">Control token <span className="font-medium text-muted">(optional)</span></p>
                      <p className="mt-1 text-xs text-muted">Used for tone sync and operational-note updates when the agent exposes those control endpoints.</p>
                      </div>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-extrabold ${agentConnection.control_token_configured ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{agentConnection.control_token_configured ? "Configured" : "Not configured"}</span>
                    </div>
                    <Input
                      label=""
                      type="password"
                      autoComplete="new-password"
                      placeholder={agentConnection.control_token_configured ? "•••••••••••• (stored)" : "Paste the agent control token"}
                      value={agentConnection.control_token}
                      disabled={agentConnection.clear_control_token}
                      onChange={(event) => setAgentConnection((current) => ({ ...current, control_token: event.target.value }))}
                    />
                    {agentConnection.control_token_configured && <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={agentConnection.clear_control_token} onChange={(event) => setAgentConnection((current) => ({ ...current, clear_control_token: event.target.checked }))} /> Remove the saved control token</label>}
                  </div>
                  <Button variant="purple" disabled={agentSaving || agentLoading} onClick={saveAgentConnection}>
                    <Save size={16} />
                    {agentSaving ? "Saving connection…" : "Save agent connection"}
                  </Button>
                </div>
              )}
            </div>
          )}
          {active === "feedback" && user?.role === "admin" && (
            <div className="grid max-w-4xl gap-5">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h3 className="text-xl font-extrabold">AI feedback</h3>
                  <p className="mt-1 text-sm text-muted">Review feedback collected while teams test each brand’s AI. Resolving an item does not change the live agent.</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => loadFeedback()} disabled={!feedbackBrandId || feedbackLoading}>
                  <RefreshCw size={15} className={feedbackLoading ? "animate-spin" : ""} /> Refresh
                </Button>
              </div>
              <Select label="Review feedback for" value={feedbackBrandId} disabled={feedbackLoading && !feedbackBrandId} onChange={(event) => setFeedbackBrandId(event.target.value)}>
                {!feedbackBrands.length && <option value="">No brands available</option>}
                {feedbackBrands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
              </Select>
              {feedbackError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{feedbackError}</p>}
              {feedbackLoading && !feedbackItems.length ? <p className="rounded-lg border border-ink/10 bg-slate-50 p-4 text-sm text-muted">Loading feedback…</p> : feedbackItems.length ? (
                <div className="grid gap-3">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted">{feedbackItems.filter((item) => item.status !== "resolved").length} open of {feedbackItems.length} total</p>
                  {feedbackItems.map((item) => {
                    const resolved = item.status === "resolved";
                    return <article key={item.id} className={`rounded-xl border p-4 ${resolved ? "border-emerald-200 bg-emerald-50/40" : "border-ink/15 bg-white"}`}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide ${resolved ? "bg-emerald-100 text-emerald-700" : "bg-primary-tint text-primary"}`}>{resolved ? "Resolved" : item.status.replaceAll("_", " ")}</span><span className="text-xs text-muted">{item.scope === "reply" ? "Reply feedback" : "Conversation feedback"} · {feedbackDate(item.created_at)}</span></div>
                          {item.tags?.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{item.tags.map((tag) => <span key={tag} className="rounded-full border border-ink/10 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600">{tag}</span>)}</div>}
                        </div>
                        <button type="button" onClick={() => updateFeedbackStatus(item, resolved ? "open" : "resolved")} disabled={Boolean(feedbackUpdatingId)} className={`inline-flex shrink-0 items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-extrabold transition disabled:opacity-50 ${resolved ? "border-slate-300 bg-white text-slate-700 hover:border-primary hover:text-primary" : "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"}`}>
                          {resolved ? "Reopen" : <><Check size={14} /> Mark resolved</>}
                        </button>
                      </div>
                      {item.note && <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{item.note}</p>}
                      {item.agent_reply && <details className="mt-3 rounded-lg border border-ink/10 bg-slate-50 px-3 py-2"><summary className="cursor-pointer text-xs font-bold text-slate-700">View AI reply</summary><p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-slate-600">{item.agent_reply}</p></details>}
                      {item.ideal_reply && <div className="mt-3 rounded-lg border border-primary/15 bg-primary-tint/25 px-3 py-2"><p className="text-[10px] font-extrabold uppercase tracking-wide text-primary">Suggested reply</p><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">{item.ideal_reply}</p></div>}
                    </article>;
                  })}
                </div>
              ) : !feedbackLoading && feedbackBrandId ? <p className="rounded-lg border border-dashed border-ink/20 bg-white p-5 text-sm text-muted">No feedback has been submitted for this brand yet.</p> : null}
            </div>
          )}
          {active === "billing" && (
            <div className="grid gap-5 lg:grid-cols-2">
              <article className="rounded-lg border-2 border-ink bg-white p-5">
                <p className="text-xs font-bold uppercase text-muted">
                  Current plan
                </p>
                <h3 className="mt-2 text-2xl font-extrabold">Starter</h3>
                <p className="mt-2 text-sm text-muted">
                  0 generations this month
                </p>
                <Button variant="orange" className="mt-4">
                  Upgrade
                </Button>
              </article>
              <div>
                <h3 className="text-xl font-extrabold">Invoices</h3>
                <p className="mt-3 text-sm text-muted">No invoices yet.</p>
              </div>
            </div>
          )}
        </div>
      </section>
      <Modal
        open={productModal}
        onClose={() => setProductModal(false)}
        title="Add product"
      >
        <form className="grid gap-4" onSubmit={saveNewProduct}>
          <Input
            label="Name"
            value={product.name}
            onChange={(event) =>
              setProduct({ ...product, name: event.target.value })
            }
          />
          <Input
            label="Price"
            value={product.price}
            onChange={(event) =>
              setProduct({ ...product, price: event.target.value })
            }
          />
          <Input
            label="URL"
            value={product.url}
            onChange={(event) =>
              setProduct({ ...product, url: event.target.value })
            }
          />
          <Textarea
            label="Short description"
            value={product.description}
            onChange={(event) =>
              setProduct({ ...product, description: event.target.value })
            }
          />
          <Button variant="purple" type="submit">
            Save product
          </Button>
        </form>
      </Modal>
      <Modal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="Invite a teammate"
      >
        <Input
          label="Email address"
          type="email"
          placeholder="name@company.com"
        />
        <Button
          variant="purple"
          className="mt-4"
          onClick={() => {
            setInviteOpen(false);
            showToast("Invite sent.");
          }}
        >
          Send invite
        </Button>
      </Modal>
      <Modal open={setupGuideOpen} onClose={closeSetupGuide} title="Setup guide">
        <p className="text-sm leading-6 text-muted">This guide is read-only. Complete each step from the Overview to prepare your brand workspace.</p>
        <ol className="mt-4 grid gap-2">{setupGuideSteps.map((step, index) => <li key={step} className="flex items-center gap-3 rounded-lg border border-ink/10 px-3 py-2 text-sm"><span className="grid h-6 w-6 place-items-center rounded-full border border-ink/20 text-xs font-extrabold">{index + 1}</span>{step}</li>)}</ol>
      </Modal>
      <ConfirmDialog
        open={deleteAccount}
        onClose={() => setDeleteAccount(false)}
        title="Delete account?"
        description="This demo action only closes this dialog; it does not delete your account."
        confirmLabel="Delete account"
        onConfirm={() => setDeleteAccount(false)}
      />
    </div>
  );
}
