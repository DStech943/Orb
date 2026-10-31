import React, { useMemo, useState } from "react";
import { Boxes, CheckCircle2, Search, Wrench } from "lucide-react";

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

function ToolCard({ tool }) {
  return (
    <article className="flex min-h-24 items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition hover:border-purple/40 hover:shadow-md">
      <ToolLogo tool={tool} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <h4 className="truncate font-extrabold">{tool.name}</h4>
          {tool.beta && <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 ring-1 ring-amber-200">Beta</span>}
          {tool.installed && <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">● Installed</span>}
        </div>
        <p className="mt-0.5 line-clamp-2 text-sm text-slate-500">{tool.description}</p>
      </div>
      <span className="shrink-0 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-extrabold text-ink shadow-sm">
        {tool.installed ? "Configure ↗" : "Install ↗"}
      </span>
    </article>
  );
}

export default function Tools() {
  const [selected, setSelected] = useState("all");
  const [query, setQuery] = useState("");
  const category = categories.find((item) => item.id === selected) || categories[0];
  const visibleTools = useMemo(() => {
    const term = query.trim().toLowerCase();
    return tools.filter((tool) => {
      const correctSection = selected === "all" ? true : selected === "installed" ? tool.installed : tool.category === selected;
      return correctSection && (!term || `${tool.name} ${tool.description}`.toLowerCase().includes(term));
    });
  }, [query, selected]);
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
          const count = item.id === "all" ? tools.length : item.id === "installed" ? tools.filter((tool) => tool.installed).length : tools.filter((tool) => tool.category === item.id).length;
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
                <div className="mt-4 grid gap-3 lg:grid-cols-3">{group.tools.map((tool) => <ToolCard key={tool.id} tool={tool} />)}</div>
              </section>
            ))}
          </div>
        ) : (
          <div className="mt-5 grid gap-3 lg:grid-cols-3">{visibleTools.map((tool) => <ToolCard key={tool.id} tool={tool} />)}</div>
        ) : (
          <div className="mt-8 grid place-items-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-6 py-14 text-center">
            <Wrench size={26} className="text-purple" />
            <h4 className="mt-3 font-extrabold">No matching tools</h4>
            <p className="mt-1 max-w-md text-sm text-slate-500">Try another search term or select a different integration category.</p>
          </div>
        )}
      </section>
    </div>
  );
}
