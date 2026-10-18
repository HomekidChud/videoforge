import { Sparkles, Palette, Type, Droplets, ArrowRightLeft } from "lucide-react";
import { FILTERS, type Clip } from "@shared/timeline";
import { MOTION_PRESETS, TITLE_PRESETS } from "@shared/presets";
import { TRANSITIONS, TRANSITION_LABELS } from "@shared/transitions";

export type Effect =
  | { kind: "motion"; id: string; label: string }
  | { kind: "filter"; id: string; label: string }
  | { kind: "title"; id: string; label: string }
  | { kind: "transition"; id: string; label: string }
  | { kind: "patch"; id: string; label: string; patch: Partial<Clip> };

const FADES: Effect[] = [
  { kind: "patch", id: "fade-in", label: "Fade in", patch: { fadeIn: 0.6 } },
  { kind: "patch", id: "fade-out", label: "Fade out", patch: { fadeOut: 0.6 } },
  { kind: "patch", id: "fade-both", label: "Fade both", patch: { fadeIn: 0.6, fadeOut: 0.6 } },
  { kind: "patch", id: "blur", label: "Soft blur", patch: { blur: 6 } },
  { kind: "patch", id: "flip", label: "Mirror", patch: { flipX: true } },
  { kind: "patch", id: "fill", label: "Fill frame", patch: { fit: "cover" } },
  { kind: "patch", id: "reset", label: "Clear look", patch: { filter: "none", blur: 0, flipX: false, flipY: false, brightness: 0, contrast: 1, saturation: 1, fadeIn: 0, fadeOut: 0 } as Partial<Clip> },
];

function Chip({ effect, disabled, onApply }: { effect: Effect; disabled: boolean; onApply: (e: Effect) => void }) {
  return <button className="effect-chip" draggable={!disabled} disabled={disabled} title="Click to apply to the selected clip, or drag onto any clip" data-testid={`effect-${effect.kind}-${effect.id}`}
    onDragStart={(e) => { e.dataTransfer.setData("application/x-vf-effect", JSON.stringify(effect)); e.dataTransfer.effectAllowed = "copy"; }} onClick={() => onApply(effect)}>{effect.label}</button>;
}

export default function ForgeEffects({ disabled, onApply }: { disabled: boolean; onApply: (e: Effect) => void }) {
  const group = (title: string, icon: React.ReactNode, items: Effect[]) => <section className="effect-group"><h4>{icon}{title}</h4><div className="effect-grid">{items.map((e) => <Chip key={`${e.kind}-${e.id}`} effect={e} disabled={disabled} onApply={onApply} />)}</div></section>;
  return <div className="effects-panel" data-testid="effects-panel">
    {group("Motion", <Sparkles size={13} />, MOTION_PRESETS.map((m) => ({ kind: "motion" as const, id: m.id, label: m.label })))}
    {group("Color", <Palette size={13} />, FILTERS.filter((f) => f !== "none").map((f) => ({ kind: "filter" as const, id: f, label: f[0].toUpperCase() + f.slice(1) })))}
    {group("Fades and looks", <Droplets size={13} />, FADES)}
    {group("Transitions", <ArrowRightLeft size={13} />, [...TRANSITIONS.map(id => ({ kind: "transition" as const, id, label: TRANSITION_LABELS[id] })), { kind: "transition" as const, id: "none", label: "No transition" }])}
    {group("Titles", <Type size={13} />, TITLE_PRESETS.map((t) => ({ kind: "title" as const, id: t.id, label: t.label })))}
  </div>;
}
