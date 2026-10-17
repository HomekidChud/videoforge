import { useEffect, useLayoutEffect, useState } from "react";

type Step = { target: string; title: string; body: string };

const STEPS: Step[] = [
  { target: ".dock", title: "The tool dock", body: "Media, effects, graphics and your projects live in the dock. Hover an icon for its name, then click to open that panel." },
  { target: ".preset-switch", title: "Workspaces", body: "Each workspace shows only the panels a job needs. Edit is the default. Your last choice is remembered." },
  { target: ".timeline-panel", title: "The timeline", body: "Drag clips to move them, drag their edges to trim, and press S to split at the playhead." },
  { target: ".inspector", title: "The inspector", body: "Select a clip to change its text, timing and look. Use the search box to jump to any setting." },
  { target: "[data-testid=button-palette]", title: "The command palette", body: "Press Ctrl+K to find any action by name. Press ? at any time to see every keyboard shortcut." },
];

/** A short first-run tour: a spotlight on one control at a time, with Back, Next and Skip. */
export default function ForgeTour({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const step = STEPS[i];
  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => { const el = document.querySelector(step.target); setRect(el ? el.getBoundingClientRect() : null); };
    measure(); window.addEventListener("resize", measure); return () => window.removeEventListener("resize", measure);
  }, [open, i, step]);
  useEffect(() => { if (open) setI(0); }, [open]);
  if (!open) return null;
  const pad = 6;
  const box = rect ? { left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 } : null;
  const cardLeft = box ? Math.min(Math.max(12, box.left + (box.width > 360 ? 16 : 0)), window.innerWidth - 352) : 24;
  const below = box ? box.top + box.height + 14 : 120;
  const cardTop = box && below + 190 > window.innerHeight ? Math.max(12, box.top - 190) : below;
  return (
    <div className="tour" role="dialog" aria-label="Studio tour" data-testid="studio-tour">
      {box && <div className="tour-spot" style={box} />}
      <div className="tour-card" style={{ left: cardLeft, top: cardTop }}>
        <small>Step {i + 1} of {STEPS.length}</small>
        <h4>{step.title}</h4>
        <p>{step.body}</p>
        <div className="tour-actions">
          <button className="ghost-link" onClick={onClose} data-testid="tour-skip">Skip tour</button>
          <div className="flex-spacer" />
          {i > 0 && <button className="secondary-btn" onClick={() => setI(i - 1)}>Back</button>}
          <button className="primary-btn" onClick={() => (i === STEPS.length - 1 ? onClose() : setI(i + 1))} data-testid="tour-next">{i === STEPS.length - 1 ? "Done" : "Next"}</button>
        </div>
      </div>
    </div>
  );
}
