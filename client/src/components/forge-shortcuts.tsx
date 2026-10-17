import { useEffect } from "react";
import { X } from "lucide-react";
import { SHORTCUTS, SHORTCUT_GROUPS } from "@shared/shortcuts";

/** The keyboard shortcut sheet, opened with the ? key. Reads the same list as the docs page. */
export default function ForgeShortcuts({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); onClose(); } };
    window.addEventListener("keydown", h, true); return () => window.removeEventListener("keydown", h, true);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="palette-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet" role="dialog" aria-label="Keyboard shortcuts" data-testid="shortcut-sheet">
        <div className="sheet-head"><h3>Keyboard shortcuts</h3><button className="icon-btn" aria-label="Close shortcut sheet" onClick={onClose}><X size={16} /></button></div>
        <div className="sheet-body">
          {SHORTCUT_GROUPS.map((g) => (
            <section key={g}><h4>{g}</h4>
              <dl>{SHORTCUTS.filter((s) => s.group === g).map((s) => <div key={s.id}><dt>{s.label}</dt><dd>{s.keys.map((k, i) => <kbd key={i}>{k}</kbd>)}</dd></div>)}</dl>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
