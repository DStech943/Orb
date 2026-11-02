import React, { useEffect, useState } from "react";
import { Mail, Mic, MicOff, Plus, Save, Trash2, Upload } from "lucide-react";
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

const tabs = [
  { id: "profile", label: "Profile" },
  { id: "team", label: "Team" },
  { id: "billing", label: "Billing" },
];
const team = [
  { name: "Keith Fernandes", email: "keith@example.com", role: "Admin" },
];

export default function Settings() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [params, setParams] = useSearchParams();
  const active = params.get("tab") || "profile";
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
  const products = useAsync(listProducts, []);
  const sources = useAsync(listSources, []);
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
  const tabChange = (next) => {
    if (dirty && !window.confirm("You have unsaved changes. Leave this tab?"))
      return;
    setDirty(false);
    setParams({ tab: next });
  };
  const save = () => {
    setDirty(false);
    showToast("Settings saved.");
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
        <Tabs tabs={tabs} active={active} onChange={tabChange} />
        <div className="p-5 sm:p-6">
          {active === "profile" && (
            <div className="grid max-w-xl gap-4">
              <div className="flex items-center gap-4">
                <Avatar name={profile.name} className="h-14 w-14" />
                <p className="text-sm text-muted">
                  Your initials are used until you add a photo.
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
