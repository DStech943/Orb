import React, { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  CircleAlert,
  Loader2,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Paperclip,
  X,
} from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import Avatar from "../ui/Avatar";
import Button from "../ui/Button";
import Dropdown from "../ui/Dropdown";
import Modal from "../ui/Modal";
import Textarea from "../ui/Textarea";
import useAsync from "../../hooks/useAsync";
import { listBrands } from "../../services/brands";
import { useAuth } from "../../context/AuthContext";
import { activeBrandName, sendSlackEscalation } from "../../services/orbApi";
import { useToast } from "../../context/ToastContext";

const titles = {
  "/app": "Overview",
  "/app/workspace": "Brand workspace",
  "/app/client-chat": "Chatspace",
  "/app/chat": "Chat with Agent",
  "/app/operations": "Operations",
  "/app/brain": "AI's Brain",
  "/app/sops": "AI's Brain",
  "/app/flows": "Flows",
  "/app/faqs": "AI's Brain",
  "/app/templates": "Templates",
  "/app/products": "Products",
  "/app/tools": "Tools",
  "/app/settings": "Settings",
};

function SlackEscalation() {
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState([]);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const fileRef = useRef(null);
  const brandName = activeBrandName();

  const close = () => {
    if (!sending) {
      setOpen(false);
      setError("");
    }
  };
  const addFiles = (event) => {
    const selected = Array.from(event.target.files || []);
    setFiles((current) => [...current, ...selected].slice(0, 5));
    event.target.value = "";
  };
  const submit = async (event) => {
    event.preventDefault();
    if (!message.trim()) {
      setError("Write a message before sharing it with the team.");
      return;
    }
    if (!brandName) {
      setError("Choose a brand before sharing feedback.");
      return;
    }
    setSending(true);
    setError("");
    try {
      await sendSlackEscalation({ message, files }, brandName);
      showToast(`Feedback shared with the ${brandName} team.`);
      setMessage("");
      setFiles([]);
      setOpen(false);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Could not share the feedback.",
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="grid h-9 w-9 place-items-center rounded-md border-2 border-ink bg-orange text-ink transition-transform hover:-translate-y-0.5"
        aria-label="Share feedback with the team"
        title="Share feedback"
        onClick={() => {
          setError("");
          setOpen(true);
        }}
      >
        <CircleAlert size={19} strokeWidth={2.5} />
      </button>
      <Modal open={open} onClose={close} title="Share feedback with the team">
        <form className="grid gap-4" onSubmit={submit}>
          <div className="border-2 border-purple/30 bg-peach p-3 text-sm">
            <p className="font-extrabold">{brandName || "Selected brand"}</p>
            <p className="mt-1 text-xs text-muted">
              Share feedback, an issue, or useful context with the team.
            </p>
          </div>
          <Textarea
            label="What needs attention?"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Describe the issue, feedback, and any useful context…"
            disabled={sending}
          />
          <div className="grid gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-bold">
                Media or files{" "}
                <span className="font-medium text-muted">(optional)</span>
              </p>
              <input
                ref={fileRef}
                className="sr-only"
                id="team-feedback-files"
                type="file"
                multiple
                accept="image/*,video/*,audio/*,application/pdf"
                onChange={addFiles}
                disabled={sending}
              />
              <label
                htmlFor="team-feedback-files"
                className="interactive-brutal inline-flex cursor-pointer items-center gap-2 rounded-md border-2 border-ink bg-white px-3 py-2 text-xs font-bold"
              >
                <Paperclip size={14} />
                Attach media
              </label>
            </div>
            {files.length > 0 && (
              <ul className="grid gap-2">
                {files.map((file, index) => (
                  <li
                    key={`${file.name}-${file.lastModified}-${index}`}
                    className="flex items-center justify-between gap-3 border-2 border-ink/20 bg-white px-3 py-2 text-xs"
                  >
                    <span className="min-w-0 truncate font-bold">
                      {file.name}
                    </span>
                    <button
                      type="button"
                      className="shrink-0 text-muted hover:text-ink"
                      aria-label={`Remove ${file.name}`}
                      onClick={() =>
                        setFiles((items) =>
                          items.filter((_, itemIndex) => itemIndex !== index),
                        )
                      }
                    >
                      <X size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-muted">
              Up to 5 files, 10 MB each. Images, video, audio, and PDFs are
              supported.
            </p>
          </div>
          {error && (
            <p
              role="alert"
              className="border-2 border-orange bg-orange/10 p-3 text-sm font-bold text-red-700"
            >
              {error}
            </p>
          )}
          <div className="flex justify-end gap-3 border-t-2 border-ink/10 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={close}
              disabled={sending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={sending || !message.trim()}>
              {sending ? (
                <>
                  <Loader2 className="animate-spin" size={16} />
                  Sharing…
                </>
              ) : (
                <>
                  <CircleAlert size={16} />
                  Share with team
                </>
              )}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );

  /*

  return <><button type="button" className="grid h-9 w-9 place-items-center rounded-md border-2 border-ink bg-orange text-ink transition-transform hover:-translate-y-0.5" aria-label="Escalate to Slack" title="Escalate to Slack" onClick={() => { setError(''); setOpen(true) }}><CircleAlert size={19} strokeWidth={2.5} /></button><Modal open={open} onClose={close} title="Escalate to Slack"><form className="grid gap-4" onSubmit={submit}><div className="border-2 border-purple/30 bg-peach p-3 text-sm"><p className="font-extrabold">{brandName || 'Selected brand'}</p><p className="mt-1 text-xs text-muted">Orb will notify the configured channel with <code className="font-bold">@channel</code>.</p></div><Textarea label="What needs attention?" value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Describe the issue, urgency, and any useful context…" disabled={sending} /><div className="grid gap-2"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-bold">Media or files <span className="font-medium text-muted">(optional)</span></p><input ref={fileRef} className="sr-only" id="slack-escalation-files" type="file" multiple accept="image/*,video/*,audio/*,application/pdf" onChange={addFiles} disabled={sending} /><label htmlFor="slack-escalation-files" className="interactive-brutal inline-flex cursor-pointer items-center gap-2 rounded-md border-2 border-ink bg-white px-3 py-2 text-xs font-bold"><Paperclip size={14} />Attach media</label></div>{files.length > 0 && <ul className="grid gap-2">{files.map((file, index) => <li key={`${file.name}-${file.lastModified}-${index}`} className="flex items-center justify-between gap-3 border-2 border-ink/20 bg-white px-3 py-2 text-xs"><span className="min-w-0 truncate font-bold">{file.name}</span><button type="button" className="shrink-0 text-muted hover:text-ink" aria-label={`Remove ${file.name}`} onClick={() => setFiles((items) => items.filter((_, itemIndex) => itemIndex !== index))}><X size={16} /></button></li>)}</ul>}<p className="text-xs text-muted">Up to 5 files, 10 MB each. Images, video, audio, and PDFs are supported.</p></div>{error && <p role="alert" className="border-2 border-orange bg-orange/10 p-3 text-sm font-bold text-red-700">{error}</p>}<div className="flex justify-end gap-3 border-t-2 border-ink/10 pt-4"><Button type="button" variant="outline" onClick={close} disabled={sending}>Cancel</Button><Button type="submit" disabled={sending || !message.trim()}>{sending ? <><Loader2 className="animate-spin" size={16} />Sending…</> : <><CircleAlert size={16} />Escalate to Slack</>}</Button></div></form></Modal></>
  */
}

export default function Topbar({ onMenu, collapsed = false, onToggleCollapse }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { data: fetchedBrands, loading: brandsLoading } = useAsync(
    listBrands,
    [],
  );
  const brands = Array.isArray(fetchedBrands) ? fetchedBrands : [];
  const [brandId, setBrandId] = useState(
    () => localStorage.getItem("orb_selected_brand") || "",
  );
  const selectedBrand = brands.find((brand) => brand.id === brandId);
  const agentName = selectedBrand?.ai_agent_name || "AI";
  const title =
    location.pathname === "/app/chat"
      ? `Chat with ${agentName}`
      : titles[location.pathname] || "Orb";
  useEffect(() => {
    if (!brands.length) return;
    if (!brands.some((brand) => brand.id === brandId)) setBrandId(brands[0].id);
  }, [brandId, brands]);
  useEffect(() => {
    const brand = brands.find((item) => item.id === brandId);
    if (!brand) return;
    localStorage.setItem("orb_selected_brand", brand.id);
    localStorage.setItem("orb_selected_brand_name", brand.name);
    localStorage.setItem(
      "orb_selected_brand_agent_name",
      brand.ai_agent_name || "",
    );
    window.dispatchEvent(
      new CustomEvent("orb:brand-changed", { detail: brand }),
    );
  }, [brandId, brands]);
  const signOut = async () => {
    await logout();
    navigate("/login");
  };
  return (
    <header className="sticky top-0 z-20 border-b-2 border-ink bg-white px-4 py-3 sm:px-6">
      <div className="flex items-center gap-3">
        <button
          className="lg:hidden"
          aria-label="Open navigation"
          onClick={onMenu}
        >
          <Menu />
        </button>
        {onToggleCollapse && (
          <button
            type="button"
            className="hidden lg:grid h-9 w-9 place-items-center rounded-md border-2 border-ink bg-white text-ink transition-transform hover:-translate-y-0.5"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={onToggleCollapse}
          >
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        )}
        <h1 className="mr-auto text-lg font-extrabold tracking-tight sm:text-xl">
          {title}
        </h1>
        {user?.role === "admin" && (
          <label className="hidden items-center gap-2 rounded-md border-2 border-ink bg-white px-2 py-2 text-xs font-bold sm:flex">
            <span className="text-muted">Brand</span>
            <select
              aria-label="Select active brand"
              value={brandId}
              onChange={(event) => setBrandId(event.target.value)}
              className="max-w-36 bg-transparent outline-none"
              disabled={brandsLoading || brands.length === 0}
            >
              <option value="">
                {brandsLoading
                  ? "Loading…"
                  : brands.length
                    ? "Choose brand"
                    : "No brands"}
              </option>
              {brands.map((brand) => (
                <option key={brand.id} value={brand.id}>
                  {brand.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <SlackEscalation />
        <Dropdown
          trigger={({ open, toggle }) => (
            <button
              className="flex items-center gap-1"
              aria-haspopup="menu"
              aria-expanded={open}
              onClick={toggle}
            >
              <Avatar name={user?.name} src={user?.avatar} sources={user?.avatarSources} />
              <ChevronDown size={15} />
            </button>
          )}
        >
          <div className="border-b border-ink/10 px-3 py-2">
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-muted">
              Role
            </p>
            <p className="mt-1 text-xs font-bold capitalize">
              {user?.role || "client"}
            </p>
          </div>
          <Link
            role="menuitem"
            to="/app/settings?tab=profile"
            className="block px-3 py-2 text-sm font-bold hover:bg-peach"
          >
            Profile
          </Link>
          {user?.role === "admin" && (
            <Link
              role="menuitem"
              to="/app/settings?tab=team"
              className="block px-3 py-2 text-sm font-bold hover:bg-peach"
            >
              Manage roles
            </Link>
          )}
          <button
            role="menuitem"
            className="block w-full px-3 py-2 text-left text-sm font-bold hover:bg-peach"
            onClick={signOut}
          >
            Log out
          </button>
        </Dropdown>
      </div>
    </header>
  );
}
