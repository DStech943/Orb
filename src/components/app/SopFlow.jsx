import React, { useEffect, useMemo, useRef, useState } from "react";
import { ClipboardCheck, GitBranch, Maximize2, MessageSquareText, Minimize2, MoreHorizontal, Play, SearchCheck, Trash2 } from "lucide-react";

const nodes = [
  { key: "situation", id: "TRIGGER", label: "Trigger", icon: Play, tone: "bg-ink text-white", hint: "Describe the customer situation…", note: "Customer support" },
  { key: "checkFirst", id: "CONDITION_1", label: "Condition", icon: SearchCheck, tone: "bg-primary-tint text-ink", hint: "What should the team check first?", condition: true },
  { key: "whatToDo", id: "ACTION_1", label: "What to do", icon: ClipboardCheck, tone: "bg-peach text-ink", hint: "Describe the action to take…" },
  { key: "whatToSay", id: "RESPONSE_1", label: "What to say", icon: MessageSquareText, tone: "bg-primary-tint text-ink", hint: "Add the customer-facing response…" },
  { key: "escalateTo", id: "BRANCH_1", label: "Escalate to", icon: GitBranch, tone: "bg-primary-tint text-ink", hint: "Name the owner or team…" },
];

function Connector() {
  return <div className="relative h-3 w-14 shrink-0" aria-hidden="true"><span className="absolute left-0 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-slate-300" /><span className="absolute left-1 right-1 top-1/2 border-t border-slate-300" /><span className="absolute right-0 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-slate-300" /></div>;
}

function FlowNode({ node, value, onChange, disabled, expanded }) {
  const Icon = node.icon;
  const [menuOpen, setMenuOpen] = useState(false);
  return <article className={`relative flex shrink-0 flex-col overflow-visible rounded-md border border-slate-200 bg-white shadow-[0_6px_18px_rgba(15,23,42,.06)] transition-[width,height] duration-200 ${expanded ? "h-[328px] w-[272px]" : "h-[224px] w-[204px]"}`}><p className="absolute -top-6 left-0 text-[10px] font-medium tracking-wide text-slate-500">{node.id}</p><header className={`flex items-center justify-between rounded-t-md px-3.5 py-3 ${node.tone}`}><div className="flex items-center gap-2 text-xs font-extrabold"><Icon size={14} strokeWidth={2} /><span>{node.label}</span></div><div className="relative"><button type="button" onClick={() => setMenuOpen((open) => !open)} aria-label={`${node.label} options`} className="rounded p-0.5 opacity-60 transition hover:bg-white/30 hover:opacity-100"><MoreHorizontal size={16} /></button>{menuOpen && <button type="button" onClick={() => { onChange(""); setMenuOpen(false); }} className="absolute right-0 top-7 z-10 flex w-24 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-2 text-left text-xs font-semibold text-red-600 shadow-lg"><Trash2 size={13} />Clear</button>}</div></header><div className="flex min-h-0 flex-1 flex-col px-3.5 pb-3.5 pt-3">{node.note && <p className="mb-2 text-[11px] text-slate-500">{node.note}</p>}<textarea aria-label={node.label} disabled={disabled} value={value || ""} placeholder={node.hint} onChange={(event) => onChange(event.target.value)} className="flow-node-textarea min-h-0 flex-1 resize-none overflow-y-auto bg-transparent text-[13px] font-medium leading-5 text-slate-700 outline-none placeholder:text-slate-400 disabled:cursor-default" />{node.condition ? <div className="mt-3 flex items-center justify-between text-[10px] font-bold text-slate-500"><span>Yes</span><span>No</span></div> : <p className="mt-3 text-right text-[10px] font-bold text-slate-500">Next</p>}</div></article>;
}

export default function SopFlow({ sop, onChange, disabled = false }) {
  const [expanded, setExpanded] = useState(false);
  const canvasRef = useRef(null);
  const values = useMemo(() => ({ situation: sop.situation || sop.title || "", checkFirst: sop.checkFirst || "", whatToDo: sop.whatToDo || "", whatToSay: sop.whatToSay || "", escalateTo: sop.escalateTo || "" }), [sop]);
  const updateValue = (key, value) => { if (!onChange || disabled) return; const next = { ...sop, [key]: value }; if (key === "situation" && (!sop.title || sop.title === sop.situation)) next.title = value || "Untitled SOP"; onChange(next); };
  useEffect(() => { if (canvasRef.current) canvasRef.current.scrollLeft = 0; }, [expanded]);
  const graphWidth = expanded ? 1584 : 1244;
  return <section aria-label="Editable SOP decision flow" className="relative overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"><div className="absolute right-4 top-4 z-10"><button type="button" onClick={() => setExpanded((value) => !value)} aria-pressed={expanded} className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-sm transition hover:border-primary hover:text-primary"><span>{expanded ? "Compact flow" : "Expand flow"}</span>{expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}</button></div><div ref={canvasRef} className={`${expanded ? "min-h-[calc(100vh-13rem)]" : "min-h-[30rem]"} overflow-x-auto px-10 py-10 transition-[min-height] duration-200`} style={{ backgroundImage: "radial-gradient(rgba(55, 74, 246, .15) 1px, transparent 1px)", backgroundSize: "12px 12px" }}><div className="flex items-center gap-0 py-12" style={{ width: graphWidth }}>{nodes.map((node, index) => <React.Fragment key={node.key}><FlowNode node={node} value={values[node.key]} onChange={(value) => updateValue(node.key, value)} disabled={disabled} expanded={expanded} />{index < nodes.length - 1 && <Connector />}</React.Fragment>)}</div></div></section>;
}
