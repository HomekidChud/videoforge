import { useEffect, useMemo, useRef, useState } from "react";
import { Command } from "cmdk";
import { Search, CornerDownLeft } from "lucide-react";
import { prefs } from "@/lib/studio-prefs";

export type PaletteCommand = {
  id: string;
  label: string;
  group: string;
  shortcut?: string;
  keywords?: string;
  disabled?: boolean;
  run: () => void;
};

/** Ctrl+K palette: every Studio action in one searchable list, recent commands first, shortcuts beside each. */
export default function ForgeCommandPalette({ open, commands, onClose }: { open: boolean; commands: PaletteCommand[]; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) { setQuery(""); setTimeout(() => input.current?.focus(), 0); } }, [open]);
  const recentIds = open ? prefs.recent() : [];
  const byId = useMemo(() => new Map(commands.map((c) => [c.id, c])), [commands]);
  const recent = recentIds.map((id) => byId.get(id)).filter((c): c is PaletteCommand => !!c && !c.disabled);
  const groups = useMemo(() => {
    const out = new Map<string, PaletteCommand[]>();
    for (const c of commands) { if (c.disabled) continue; (out.get(c.group) ?? out.set(c.group, []).get(c.group)!).push(c); }
    return Array.from(out.entries());
  }, [commands]);
  if (!open) return null;
  const choose = (c: PaletteCommand) => { prefs.pushRecent(c.id); onClose(); setTimeout(c.run, 0); };
  const item = (c: PaletteCommand, prefix = "") => (
    <Command.Item key={prefix + c.id} value={`${prefix}${c.label} ${c.group} ${c.keywords ?? ""}`} onSelect={() => choose(c)} data-testid={`command-${c.id}`}>
      <span className="pal-label">{c.label}</span>
      {c.shortcut && <span className="pal-keys">{c.shortcut.split(" ").map((k, i) => <kbd key={i}>{k}</kbd>)}</span>}
    </Command.Item>
  );
  return (
    <div className="palette-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }} data-testid="command-palette">
      <Command className="palette" label="Command palette" loop onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); } }}>
        <div className="pal-search"><Search size={16} aria-hidden="true" /><Command.Input ref={input} value={query} onValueChange={setQuery} placeholder="Search commands, panels and settings" aria-label="Search commands" /></div>
        <Command.List>
          <Command.Empty>No command matches that search.</Command.Empty>
          {!query && recent.length > 0 && <Command.Group heading="Recent">{recent.map((c) => item(c, "recent "))}</Command.Group>}
          {groups.map(([g, list]) => <Command.Group key={g} heading={g}>{list.map((c) => item(c))}</Command.Group>)}
        </Command.List>
        <div className="pal-foot"><span><kbd>Up</kbd><kbd>Down</kbd> to move</span><span><CornerDownLeft size={12} aria-hidden="true" /> to run</span><span><kbd>Esc</kbd> to close</span></div>
      </Command>
    </div>
  );
}
