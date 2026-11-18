import React, { useEffect, useMemo, useState } from "react";
import { Check, Loader2, Search, X } from "lucide-react";
import Avatar from "../ui/Avatar";
import { avatarUrlFromKey } from "../../services/avatar";
import { listBrandSlackPeople } from "../../services/orbApi";

// Teammates a tester can tag so they are mentioned in the Slack message. The list comes
// from Orb; Slack user ids never reach the browser, only Orb's own directory ids do.
const STYLES = {
  modal: {
    chip: "inline-flex items-center gap-1 rounded-full border-2 border-ink bg-primary-tint py-0.5 pl-2.5 pr-1.5 text-xs font-bold hover:bg-white",
    search: "flex items-center gap-2 rounded-md border-2 border-ink bg-white px-3 py-2 focus-within:ring-2 focus-within:ring-purple",
    list: "max-h-40 overflow-y-auto border-2 border-ink/20 bg-white",
    row: "px-3 py-2 hover:bg-primary-tint",
    rowOn: "bg-primary-tint/60",
    name: "text-sm font-bold",
    sub: "text-xs text-muted",
    box: "h-5 w-5 border-2 border-ink",
    boxOn: "bg-primary text-white",
    note: "border-2 border-dashed border-ink/25 bg-slate-50 p-3 text-xs text-muted",
    avatar: "!h-7 !w-7 shrink-0 !rounded-full !text-[10px]",
  },
  compact: {
    chip: "inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 py-0.5 pl-2 pr-1 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100",
    search: "flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-100",
    list: "max-h-32 overflow-y-auto rounded-lg border border-slate-200 bg-white",
    row: "px-2.5 py-1.5 hover:bg-indigo-50",
    rowOn: "bg-indigo-50/70",
    name: "text-xs font-bold text-slate-800",
    sub: "text-[11px] text-slate-500",
    box: "h-4 w-4 rounded border border-slate-300",
    boxOn: "border-indigo-600 bg-indigo-600 text-white",
    note: "rounded-lg border border-dashed border-slate-300 bg-white p-2.5 text-[11px] text-slate-500",
    avatar: "!h-6 !w-6 shrink-0 !rounded-full !border !text-[9px]",
  },
};

export default function TeammatePicker({ brandId, active = true, value, onChange, disabled = false, variant = "modal" }) {
  const s = STYLES[variant] || STYLES.modal;
  const [people, setPeople] = useState({ status: "idle", list: [] });
  const [search, setSearch] = useState("");

  // Only load while the picker is actually shown, so nothing is requested for people who
  // never use it.
  useEffect(() => {
    if (!active || !brandId) return undefined;
    let live = true;
    setSearch("");
    setPeople({ status: "loading", list: [] });
    listBrandSlackPeople(brandId)
      .then((result) => {
        if (!live) return;
        const list = Array.isArray(result?.people) ? result.people.filter((person) => person?.id && person?.name) : null;
        setPeople(list ? { status: "ready", list } : { status: "unavailable", list: [] });
      })
      .catch(() => {
        if (live) setPeople({ status: "unavailable", list: [] });
      });
    return () => {
      live = false;
    };
  }, [active, brandId]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return people.list;
    return people.list.filter((person) => `${person.name} ${person.email || ""} ${person.role || ""}`.toLowerCase().includes(term));
  }, [people.list, search]);
  const tagged = people.list.filter((person) => value.includes(person.id));
  const toggle = (id) => onChange(value.includes(id) ? value.filter((item) => item !== id) : [...value, id]);

  if (people.status === "loading")
    return (
      <p className={`flex items-center gap-2 ${s.sub}`}>
        <Loader2 size={13} className="animate-spin" /> Loading teammates…
      </p>
    );
  if (people.status === "unavailable")
    return <p className={s.note}>Teammate tagging isn't available right now. It will still be sent to the team's Slack channel.</p>;
  if (people.status !== "ready") return null;

  return (
    <div className="grid gap-2">
      {tagged.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Tagged teammates">
          {tagged.map((person) => (
            <li key={person.id}>
              <button type="button" onClick={() => toggle(person.id)} disabled={disabled} aria-label={`Remove ${person.name}`} className={s.chip}>
                @{person.name}
                <X size={variant === "modal" ? 13 : 11} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <label className={s.search}>
        <Search size={14} className="shrink-0 text-slate-400" />
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search teammates"
          aria-label="Search teammates"
          disabled={disabled}
          className={`min-w-0 flex-1 bg-transparent font-medium outline-none ${variant === "modal" ? "text-sm" : "text-xs"}`}
        />
      </label>
      <ul className={s.list}>
        {visible.length === 0 && <li className={`p-3 ${s.sub}`}>No teammates match “{search.trim()}”.</li>}
        {visible.map((person) => {
          const selected = value.includes(person.id);
          return (
            <li key={person.id} className="border-b border-slate-200/70 last:border-b-0">
              <button
                type="button"
                role="checkbox"
                aria-checked={selected}
                aria-label={person.name}
                onClick={() => toggle(person.id)}
                disabled={disabled}
                className={`flex w-full items-center gap-2.5 text-left ${s.row} ${selected ? s.rowOn : ""}`}
              >
                <Avatar name={person.name} src={person.avatar || avatarUrlFromKey(person.avatar_key)} className={s.avatar} />
                <span className="min-w-0 flex-1">
                  <span className={`block truncate ${s.name}`}>{person.name}</span>
                  {(person.role || person.email) && <span className={`block truncate ${s.sub}`}>{person.role || person.email}</span>}
                </span>
                <span className={`grid shrink-0 place-items-center ${s.box} ${selected ? s.boxOn : "bg-white"}`} aria-hidden="true">
                  {selected && <Check size={variant === "modal" ? 13 : 11} strokeWidth={3} />}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
