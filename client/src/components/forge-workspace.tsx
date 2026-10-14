import { useRef } from "react";

/** Keyboard and pointer accessible grid divider. Layout is transient, not browser storage. */
export function WorkspaceDivider({ axis, label, value, min, max, onChange }: {
  axis: "horizontal" | "vertical"; label: string; value: number; min: number; max: number; onChange: (value: number) => void;
}) {
  const origin = useRef<{ position: number; value: number } | null>(null);
  return <div className={`workspace-divider divider-${axis}`} role="separator" tabIndex={0}
    aria-label={label} aria-orientation={axis === "horizontal" ? "vertical" : "horizontal"}
    aria-valuenow={value} aria-valuemin={min} aria-valuemax={max} data-testid={`resize-${label.toLowerCase().replaceAll(" ", "-")}`}
    onDoubleClick={() => onChange(Math.max(min,Math.min(max,axis === "vertical" ? 300 : label === "Library width" ? 264 : 300)))}
    onKeyDown={e => {
      const delta = e.key === "ArrowRight" || e.key === "ArrowDown" ? 16 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -16 : 0;
      if (delta) { e.preventDefault(); onChange(Math.max(min, Math.min(max, value + delta))); }
      if (e.key === "Home") { e.preventDefault(); onChange(min); }
      if (e.key === "End") { e.preventDefault(); onChange(max); }
    }}
    onPointerDown={e => {
      e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId);
      origin.current = { position: axis === "horizontal" ? e.clientX : e.clientY, value };
    }}
    onPointerMove={e => {
      if (!origin.current) return;
      const delta = (axis === "horizontal" ? e.clientX : e.clientY) - origin.current.position;
      const reverse = label === "Inspector width" || axis === "vertical";
      onChange(Math.round(Math.max(min, Math.min(max, origin.current.value + delta * (reverse ? -1 : 1)))));
    }}
    onPointerUp={() => { origin.current = null; }} onPointerCancel={() => { origin.current = null; }}>
    <span />
  </div>;
}
