import React, { useEffect, useMemo, useState } from "react";
import { Boxes, CheckCircle2, KeyRound, Link2, Loader2, Search, Store, Wrench } from "lucide-react";
import Modal from "../components/ui/Modal";
import { activeBrandName, getShopifyCredentialStatus, hasOrbApi, importShopifySource, listRemoteBrands } from "../services/orbApi";
import { useToast } from "../context/ToastContext";

const categoryMeta = {
  commerce: {
    label: "Commerce",
    description: "Storefront, order, and checkout data sources.",
  },
  shipping: {
    label: "Shipping",
    description: "Shipment tracking, fulfilment, and delivery updates.",
  },
  returns: {
    label: "Returns",
    description: "Return requests, refunds, exchanges, and reverse logistics.",
  },
  loyalty: {
    label: "Loyalty & Reviews",
    description: "Rewards, reviews, referrals, and customer programmes.",
  },
  payments: {
    label: "Identity & Payments",
    description: "Checkout, payment, refund, and identity event sources.",
  },
  automation: {
    label: "Automation & webhooks",
    description: "Custom event and workflow connections.",
  },
};

const tools = [
  {
    id: "shopify", name: "Shopify", category: "commerce",
    description: "Import storefront, products, orders, and checkout data.", mark: "S", colourLogo: true, accent: "bg-[#95bf47] text-white", logoFile: "logo.png",
  },
  { id: "eshopbox", name: "Eshopbox", category: "commerce", description: "Connect fulfilment and ecommerce operations.", mark: "E", logoFile: "logo.png", colourLogo: true, accent: "bg-white text-ink" },
  { id: "woocommerce", name: "WooCommerce", category: "commerce", description: "Sync WooCommerce orders and product activity.", mark: "W" },
  { id: "unicommerce", name: "Unicommerce", category: "commerce", description: "Connect order, inventory, and fulfilment data.", mark: "U" },
  { id: "easyecom", name: "EasyEcom", category: "commerce", description: "Look up orders and start customer journeys.", mark: "E" },
  { id: "vinculum", name: "Vinculum", category: "commerce", description: "Connect Vin eRetail orders and inventory.", mark: "V" },
  { id: "loop-subscriptions", name: "Loop Subscriptions", category: "commerce", description: "Subscription details and customer support signals.", mark: "L" },

  { id: "velocity-shipping", name: "Velocity Shipping", category: "shipping", beta: true, description: "Connect Velocity Shipping to manage deliveries.", mark: "V" },
  { id: "shiprocket", name: "Shiprocket", category: "shipping", description: "Shipping details and delivery updates.", mark: "S" },
  { id: "shipstation", name: "ShipStation", category: "shipping", beta: true, description: "Shipping details and delivery updates.", mark: "S" },
  { id: "shipway", name: "Shipway", category: "shipping", description: "Manage shipments and track orders.", mark: "S" },
  { id: "fulfillment-com", name: "Fulfillment.com", category: "shipping", description: "Manage fulfilment orders and tracking events.", mark: "F" },
  { id: "shipglobal", name: "ShipGlobal", category: "shipping", description: "Track international shipments and delivery updates.", mark: "S" },
  { id: "shadowfax", name: "Shadowfax", category: "shipping", description: "Connect Shadowfax shipment tracking.", mark: "S" },
  { id: "ekart", name: "Ekart", category: "shipping", description: "Shipping details and delivery updates.", mark: "E" },
  { id: "nimbuspost", name: "NimbusPost", category: "shipping", description: "Shipping details and delivery updates.", mark: "N" },
  { id: "proship", name: "Proship", category: "shipping", description: "Connect Proship to track shipments.", mark: "P" },
  { id: "goswift", name: "GoSwift", category: "shipping", colourLogo: true, accent: "bg-[#55a55b] text-white", description: "Shipping details and delivery updates.", mark: "G" },
  { id: "ithink-logistics", name: "iThink Logistics", category: "shipping", description: "Shipment status and delivery events.", mark: "i" },
  { id: "clickpost", name: "ClickPost", category: "shipping", description: "Shipping details and delivery updates.", mark: "C" },
  { id: "fship", name: "FShip", category: "shipping", description: "Shipping details and delivery updates.", mark: "F" },
  { id: "zopoxo", name: "Zopoxo", category: "shipping", description: "Shipping details and delivery updates.", mark: "Z" },
  { id: "delhivery", name: "Delhivery", category: "shipping", description: "Connect Delhivery for shipment updates.", mark: "D" },
  { id: "blue-dart", name: "Blue Dart", category: "shipping", beta: true, description: "Shipping details and delivery updates.", mark: "B" },
  { id: "rapidshyp", name: "RapidShyp", category: "shipping", description: "Keep customers informed about delivery status.", mark: "R" },
  { id: "shipease", name: "ShipEase", category: "shipping", description: "Connect ShipEase for shipping events.", mark: "S" },
  { id: "shipclues", name: "ShipClues", category: "shipping", description: "Connect ShipClues for delivery updates.", mark: "S" },
  { id: "openleaf", name: "Openleaf", category: "shipping", description: "Shipping details and delivery updates.", mark: "O" },
  { id: "quiqup", name: "Quiqup", category: "shipping", description: "Receive real-time order and delivery updates.", mark: "Q" },
  { id: "gokwik-ship", name: "GoKwik Ship", category: "shipping", description: "Shipment status, updates, and delivery events.", mark: "G" },

  { id: "return-prime", name: "Return Prime", category: "returns", colourLogo: true, accent: "bg-[#1b887f] text-white", description: "Connect Return Prime to receive return requests.", mark: "R" },
  { id: "quickreturns", name: "QuickReturns", category: "returns", description: "Return and exchange details and status updates.", mark: "Q" },
  { id: "pragma", name: "Pragma", category: "returns", beta: true, description: "Return, refund, exchange, and shipment events.", mark: "P" },
  { id: "ecoreturns", name: "EcoReturns", category: "returns", description: "Connect EcoReturns to manage return activity.", mark: "E" },

  { id: "judge-me", name: "Judge.me", category: "loyalty", beta: true, colourLogo: true, accent: "bg-[#38bfa7] text-white", description: "Reviews and customer feedback from Judge.me.", mark: "J" },
  { id: "referrush", name: "ReferRush", category: "loyalty", description: "Track referral programme events.", mark: "R" },
  { id: "nector-rewards", name: "Nector Rewards", category: "loyalty", description: "Connect with Nector for loyalty programme data.", mark: "N" },
  { id: "smile-io", name: "Smile.io", category: "loyalty", beta: true, description: "Customer points, referrals, and reward activity.", mark: "S" },
  { id: "flits", name: "Flits", category: "loyalty", description: "Loyalty details and customer activity.", mark: "F" },
  { id: "trustoo", name: "Trustoo", category: "loyalty", description: "Connect with Trustoo for review events.", mark: "T" },

  { id: "shopflo", name: "Shopflo", category: "payments", description: "Connect with Shopflo for enhanced checkout events.", mark: "S" },
  { id: "nitrocommerce", name: "Nitrocommerce", category: "payments", description: "Connect Nitrocommerce visitor and checkout events.", mark: "N" },
  { id: "razorpay", name: "Razorpay", category: "payments", description: "Payment and refund details and payment events.", mark: "R" },
  { id: "razorpay-magic-checkout", name: "Razorpay Magic Checkout", category: "payments", description: "Receive Magic Checkout order and payment data.", mark: "R" },
  { id: "breeze-checkout", name: "Breeze Checkout", category: "payments", description: "Receive Breeze checkout and payment events.", mark: "B" },
  { id: "gokwik-checkout", name: "GoKwik Checkout", category: "payments", description: "Integrate GoKwik checkout and RTO signals.", mark: "G" },
  { id: "fastrr-shiprocket", name: "Fastrr - Shiprocket", category: "payments", description: "Connect Fastrr for checkout events.", mark: "F" },
  { id: "ccavenue", name: "CCAvenue", category: "payments", description: "Connect CCAvenue for payment and refund data.", mark: "CC" },
  { id: "easebuzz", name: "Easebuzz", category: "payments", description: "Connect Easebuzz for payment and refund events.", mark: "E" },

  { id: "custom-webhook", name: "Custom Webhook", category: "automation", description: "Connect a custom app using webhook events.", mark: "<>" },
];

const categories = [
  { id: "all", label: "All", description: "Every available integration in the Orb catalogue." },
  { id: "installed", label: "Installed", description: "Everything already connected to this workspace, for quick access." },
  ...Object.entries(categoryMeta).map(([id, item]) => ({ id, ...item })),
];

function ToolLogo({ tool }) {
  // A logo can be supplied as SVG, PNG, or WebP.  Most folders will only have
  // one of these, so try the standard filenames before showing the letter badge.
  const logoFiles = tool.logoFile ? [tool.logoFile] : ["logo.svg", "logo.png", "logo.webp"];
  const [logoIndex, setLogoIndex] = useState(0);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const logoPath = `/tools/${tool.id}/${logoFiles[logoIndex]}`;

  const useNextLogo = () => {
    if (logoIndex < logoFiles.length - 1) {
      setLogoIndex((index) => index + 1);
    } else {
      setImageFailed(true);
    }
  };

  return (
    <span className={`relative grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-lg border border-slate-200 text-xs font-extrabold ${tool.colourLogo ? tool.accent : "bg-white text-ink"}`}>
      {!imageLoaded && <span aria-hidden="true">{tool.mark}</span>}
      {!imageFailed && (
        <img
          src={logoPath}
          alt=""
          aria-hidden="true"
          onLoad={() => setImageLoaded(true)}
          onError={useNextLogo}
          className={`absolute inset-0 h-full w-full object-contain p-1.5 ${tool.colourLogo ? "" : "grayscale contrast-125"}`}
        />
      )}
    </span>
  );
}

function ToolCard({ tool, onOpen }) {
  return (
    <article role="button" tabIndex={0} onClick={() => onOpen?.(tool)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen?.(tool); } }} className="flex min-h-24 cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition hover:border-purple/40 hover:shadow-md">
      <ToolLogo tool={tool} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <h4 className="truncate font-extrabold">{tool.name}</h4>
          {tool.beta && <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 ring-1 ring-amber-200">Beta</span>}
          {tool.installed && <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">● Installed</span>}
        </div>
        <p className="mt-0.5 line-clamp-2 text-sm text-slate-500">{tool.description}</p>
      </div>
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-extrabold text-ink shadow-sm transition hover:border-purple/35 hover:bg-slate-50">
        {tool.installed ? "Configure" : "Install"}<Link2 size={13} strokeWidth={2.25} aria-hidden="true" />
      </span>
    </article>
  );
}

function ShopifySetupModal({ open, onClose, brandName, brandId, onInstalled }) {
  const [domain, setDomain] = useState(''); const [accessToken, setAccessToken] = useState(''); const [credential, setCredential] = useState(null); const [manual, setManual] = useState(false); const [loading, setLoading] = useState(false); const [installing, setInstalling] = useState(false); const [error, setError] = useState('')
  useEffect(() => { if (!open) return undefined; setError(''); setManual(false); setAccessToken(''); setCredential(null); if (!hasOrbApi || !brandName) return undefined; let active = true; setLoading(true); getShopifyCredentialStatus(brandName).then((result) => { if (active) { setCredential(result); if (result?.domain) setDomain(result.domain) } }).catch(() => { if (active) setCredential({ source: 'unavailable', token_available: false }) }).finally(() => { if (active) setLoading(false) }); return () => { active = false } }, [open, brandName])
  const vaultReady = Boolean(credential?.token_available && credential?.domain) && !manual
  const submit = async (event) => { event.preventDefault(); setError(''); if (!brandId || !brandName) return setError('Choose a brand from the top bar before installing Shopify.'); if (!vaultReady && (!domain.trim() || !accessToken.trim())) return setError('Enter both the Shopify domain and Admin API token.'); try { setInstalling(true); const result = await importShopifySource({ brandId, brandName, domain: vaultReady ? '' : domain.trim(), accessToken: vaultReady ? '' : accessToken.trim(), useVault: vaultReady }); onInstalled(result?.domain || domain.trim()); onClose() } catch (cause) { setError(cause.message || 'Shopify could not be installed.') } finally { setInstalling(false) } }
  const vaultMessage = loading ? 'Checking the secure Vault…' : vaultReady ? 'Credentials found in Vault. The Admin token stays on the server.' : credential?.source === 'unavailable' ? 'Vault is unavailable right now. Enter credentials once to continue.' : 'No complete Shopify credentials were found for this brand in Vault.'
  return <Modal open={open} onClose={onClose} title="Install Shopify"><form onSubmit={submit} className="space-y-4"><div className="rounded-lg border border-purple/20 bg-purple/5 p-3"><div className="flex items-center gap-2 text-sm font-extrabold text-ink"><Store size={16} className="text-purple" />{brandName || 'Choose a brand'}</div><p className="mt-1 text-xs leading-5 text-slate-600">Orb checks <code>SHOPIFY_&lt;BRAND&gt;_TOKEN</code> and <code>SHOPIFY_&lt;BRAND&gt;_DOMAIN</code> in Vault first.</p><p className="mt-2 text-xs font-semibold text-purple">{vaultMessage}</p></div><label className="grid gap-1.5 text-sm font-bold">Shopify domain<input value={domain} onChange={(event) => setDomain(event.target.value)} disabled={vaultReady} placeholder="your-store.myshopify.com" className="rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-purple disabled:bg-slate-100" /></label><label className="grid gap-1.5 text-sm font-bold">Admin API token<div className="relative"><input type="password" value={vaultReady ? 'vault-managed-token' : accessToken} onChange={(event) => setAccessToken(event.target.value)} disabled={vaultReady} placeholder="shpat_…" className="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 pr-10 text-sm font-normal outline-none focus:border-purple disabled:bg-slate-100" />{vaultReady && <KeyRound size={16} className="absolute right-3 top-3 text-emerald-600" />}</div></label>{vaultReady ? <button type="button" onClick={() => { setManual(true); setAccessToken('') }} className="text-left text-xs font-bold text-purple hover:underline">Use different credentials instead</button> : <p className="text-xs leading-5 text-slate-500">Manual credentials are used only to start this import and are not stored in Orb.</p>}{error && <p role="alert" className="text-sm font-semibold text-red-600">{error}</p>}<div className="flex justify-end gap-2 pt-1"><button type="button" onClick={onClose} className="rounded-md border border-slate-200 px-3 py-2 text-sm font-bold">Cancel</button><button type="submit" disabled={installing || loading} className="inline-flex items-center gap-2 rounded-md bg-purple px-3 py-2 text-sm font-extrabold text-white disabled:opacity-60">{installing && <Loader2 size={15} className="animate-spin" />}{vaultReady ? 'Install from Vault' : 'Install Shopify'}</button></div></form></Modal>
}

export default function Tools() {
  const { showToast } = useToast();
  const [selected, setSelected] = useState("all");
  const [query, setQuery] = useState("");
  const [shopifyOpen, setShopifyOpen] = useState(false);
  const [brandName, setBrandName] = useState(() => activeBrandName());
  const [brandId, setBrandId] = useState(() => window.localStorage.getItem('orb_selected_brand') || '');
  const [installedIds, setInstalledIds] = useState(() => new Set());
  useEffect(() => { const syncBrand = async () => { const nextName = activeBrandName(), storedId = window.localStorage.getItem('orb_selected_brand') || ''; setBrandName(nextName); setBrandId(storedId); if (!storedId && nextName && hasOrbApi) { try { const result = await listRemoteBrands(); const match = result?.brands?.find((brand) => brand.name === nextName); if (match?.id) setBrandId(match.id) } catch {} } }; syncBrand(); window.addEventListener('orb:brand-changed', syncBrand); return () => window.removeEventListener('orb:brand-changed', syncBrand) }, []);
  useEffect(() => { try { setInstalledIds(new Set(JSON.parse(window.localStorage.getItem(`orb_installed_tools:${brandName || 'unassigned'}`) || '[]'))) } catch { setInstalledIds(new Set()) } }, [brandName]);
  const workspaceTools = useMemo(() => tools.map((tool) => ({ ...tool, installed: installedIds.has(tool.id) })), [installedIds]);
  const openTool = (tool) => { if (tool.id === 'shopify') setShopifyOpen(true); else showToast(`${tool.name} setup is coming soon.`) };
  const markShopifyInstalled = (domain) => { setInstalledIds((current) => { const next = new Set(current); next.add('shopify'); window.localStorage.setItem(`orb_installed_tools:${brandName || 'unassigned'}`, JSON.stringify([...next])); return next }); showToast(`Shopify import started for ${domain}.`) };
  const category = categories.find((item) => item.id === selected) || categories[0];
  const visibleTools = useMemo(() => {
    const term = query.trim().toLowerCase();
    return workspaceTools.filter((tool) => {
      const correctSection = selected === "all" ? true : selected === "installed" ? tool.installed : tool.category === selected;
      return correctSection && (!term || `${tool.name} ${tool.description}`.toLowerCase().includes(term));
    });
  }, [query, selected, workspaceTools]);
  const groups = useMemo(
    () =>
      Object.entries(categoryMeta)
        .map(([id, item]) => ({
          id,
          ...item,
          tools: visibleTools.filter((tool) => tool.category === id),
        }))
        .filter((group) => group.tools.length),
    [visibleTools],
  );

  return (
    <div className="mx-auto max-w-7xl">
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-widest text-purple">Workspace tools</p>
          <h2 className="mt-1 text-3xl font-extrabold tracking-tight">Integrations</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted">Browse integrations by function. Connected tools stay in Installed so they are always easy to find.</p>
        </div>
        <label className="flex w-full items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 sm:w-72">
          <Search size={16} className="text-slate-400" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search integrations" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
        </label>
      </section>

      <div className="mt-6 flex gap-1 overflow-x-auto border-b border-slate-200">
        {categories.map((item) => {
          const count = item.id === "all" ? workspaceTools.length : item.id === "installed" ? workspaceTools.filter((tool) => tool.installed).length : workspaceTools.filter((tool) => tool.category === item.id).length;
          return (
            <button type="button" key={item.id} onClick={() => setSelected(item.id)} className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-bold transition-colors ${selected === item.id ? "border-purple text-purple" : "border-transparent text-slate-500 hover:text-ink"}`}>
              {item.label}
              <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">{count}</span>
            </button>
          );
        })}
      </div>

      <section className="mt-6">
        {selected !== "all" && (
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-purple/10 p-2 text-purple">{selected === "installed" ? <CheckCircle2 size={20} /> : <Boxes size={20} />}</div>
            <div>
              <h3 className="text-xl font-extrabold">{category.label}</h3>
              <p className="mt-1 text-sm text-slate-500">{category.description}</p>
            </div>
          </div>
        )}
        {visibleTools.length ? selected === "all" ? (
          <div className="space-y-9">
            {groups.map((group) => (
              <section key={group.id}>
                <h3 className="font-extrabold">{group.label} <span className="ml-1 text-sm font-medium text-slate-400">{group.tools.length} integrations</span></h3>
                <p className="mt-1 text-sm text-slate-500">{group.description}</p>
                <div className="mt-4 grid gap-3 lg:grid-cols-3">{group.tools.map((tool) => <ToolCard key={tool.id} tool={tool} onOpen={openTool} />)}</div>
              </section>
            ))}
          </div>
        ) : (
          <div className="mt-5 grid gap-3 lg:grid-cols-3">{visibleTools.map((tool) => <ToolCard key={tool.id} tool={tool} onOpen={openTool} />)}</div>
        ) : (
          <div className="mt-8 grid place-items-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-6 py-14 text-center">
            <Wrench size={26} className="text-purple" />
            <h4 className="mt-3 font-extrabold">No matching tools</h4>
            <p className="mt-1 max-w-md text-sm text-slate-500">Try another search term or select a different integration category.</p>
          </div>
        )}
      </section>
      <ShopifySetupModal open={shopifyOpen} onClose={() => setShopifyOpen(false)} brandName={brandName} brandId={brandId} onInstalled={markShopifyInstalled} />
    </div>
  );
}
