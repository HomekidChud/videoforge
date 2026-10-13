// ============================================================================
// Live sessions: in-memory presence and activity for every project.
//
// Editors publish their working copy (timeline, playhead, selection) a few times
// a second. API clients and saves feed the same store. Master admins watch it
// with GET /api/live/:id, a view-only endpoint: it can never change a project.
// Nothing here is persisted; a restart clears presence and the activity feed.
// ============================================================================
import type { Express, Request } from "express";
import { storage } from "./storage";
import { requireScope, requireAdmin, projectAllowed } from "./auth";
import { normalizeTimeline, clipDuration, type Timeline, type Clip } from "@shared/timeline";

export type Actor = { id: string; label: string; scope: string };
export type Activity = { seq: number; ts: number; actor: string; kind: "add" | "remove" | "edit" | "project" | "api" | "render" | "session"; summary: string; clipId?: string; count: number };
type LiveSession = {
  projectId: string; name: string; rev: number; timelineRev: number; timeline: Timeline;
  time: number; selectedId: string | null; playing: boolean;
  actor: Actor | null; source: "editor" | "api" | "save" | "idle"; updatedAt: number; editorAt: number;
  activity: Activity[]; seq: number; watchers: Map<string, number>;
};

const sessions = new Map<string, LiveSession>();
const LIVE_MS = 15000, WATCH_MS = 3000, MAX_ACTIVITY = 200, MERGE_MS = 1500;

const parse = (json: string): Timeline => normalizeTimeline(JSON.parse(json));
function session(projectId: string): LiveSession | null {
  let s = sessions.get(projectId);
  if (s) return s;
  const p = storage.getProject(projectId);
  if (!p) return null;
  s = { projectId, name: p.name, rev: 1, timelineRev: 1, timeline: parse(p.timelineJson), time: 0, selectedId: null, playing: false, actor: null, source: "idle", updatedAt: p.updatedAt, editorAt: 0, activity: [], seq: 0, watchers: new Map() };
  sessions.set(projectId, s);
  return s;
}
export const actorOf = (req: Request): Actor => { const k = (req as any).apiKey; return { id: k?.id ?? "unknown", label: k?.label ?? "unknown key", scope: k?.scope ?? "read" }; };

function clipLabel(c: Clip): string {
  if (!c.assetId) return `title “${(c.text ?? "").slice(0, 28)}”`;
  return c.label ?? storage.getAsset(c.assetId)?.filename ?? "clip";
}
function log(s: LiveSession, actor: Actor, kind: Activity["kind"], summary: string, clipId?: string) {
  const last = s.activity[s.activity.length - 1], ts = Date.now();
  // Coalesce a drag or slider scrub into one entry rather than dozens.
  if (last && kind === "edit" && last.kind === "edit" && last.clipId === clipId && last.actor === actor.label && ts - last.ts < MERGE_MS) { last.ts = ts; last.summary = summary; last.count++; return; }
  s.activity.push({ seq: ++s.seq, ts, actor: actor.label, kind, summary, clipId, count: 1 });
  if (s.activity.length > MAX_ACTIVITY) s.activity.splice(0, s.activity.length - MAX_ACTIVITY);
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Describe what changed between two timelines as activity entries. */
function diffTimelines(s: LiveSession, actor: Actor, prev: Timeline, next: Timeline, kind: "edit" | "api") {
  const before = new Map(prev.clips.map((c) => [c.id, c])), after = new Map(next.clips.map((c) => [c.id, c]));
  for (const c of next.clips) if (!before.has(c.id)) log(s, actor, "add", `Added ${clipLabel(c)} to ${c.track}`, c.id);
  for (const c of prev.clips) if (!after.has(c.id)) log(s, actor, "remove", `Removed ${clipLabel(c)}`, c.id);
  for (const c of next.clips) {
    const o = before.get(c.id); if (!o || same(o, c)) continue;
    const keys = Array.from(new Set([...Object.keys(o), ...Object.keys(c)])).filter((k) => !same((o as any)[k], (c as any)[k]));
    const names = keys.map((k) => (k === "inPoint" || k === "outPoint" ? "trim" : k)).filter((k, i, a) => a.indexOf(k) === i);
    log(s, actor, "edit", `Edited ${clipLabel(c)}: ${names.slice(0, 5).join(", ")}${names.length > 5 ? "…" : ""}`, c.id);
  }
  const project: string[] = [];
  if (prev.fps !== next.fps) project.push(`frame rate ${next.fps}`);
  if (!same(prev.resolution, next.resolution)) project.push(`canvas ${next.resolution.width}×${next.resolution.height}`);
  if (prev.background !== next.background) project.push("background");
  if (!same(prev.tracks, next.tracks)) project.push("tracks");
  if ((prev.markers?.length ?? 0) !== (next.markers?.length ?? 0)) project.push(`markers ${next.markers?.length ?? 0}`);
  if (project.length) log(s, actor, "project", `Changed ${project.join(", ")}`);
  void clipDuration; void kind;
}

/** Feed a changed timeline into the session (from a save, an API op or an editor publish). */
export function syncTimeline(projectId: string, actor: Actor, timeline: Timeline, source: LiveSession["source"], summary?: string) {
  const s = session(projectId); if (!s) return;
  if (!same(s.timeline, timeline)) {
    if (summary) log(s, actor, "api", summary); else diffTimelines(s, actor, s.timeline, timeline, source === "api" ? "api" : "edit");
    s.timeline = timeline; s.timelineRev++; s.rev++; s.source = source; s.actor = actor; s.updatedAt = Date.now();
    if (source === "editor") s.editorAt = s.updatedAt;
  }
}
export function logEvent(projectId: string, actor: Actor, kind: Activity["kind"], summary: string) {
  const s = session(projectId); if (!s) return; log(s, actor, kind, summary); s.rev++; s.updatedAt = Date.now();
}
export function renameLive(projectId: string, name: string) { const s = sessions.get(projectId); if (s && s.name !== name) { s.name = name; s.rev++; } }
export function dropLive(projectId: string) { sessions.delete(projectId); }

const isLive = (s: LiveSession) => Date.now() - s.updatedAt < LIVE_MS;
const watchers = (s: LiveSession) => { const t = Date.now(); s.watchers.forEach((at, k) => { if (t - at > WATCH_MS) s.watchers.delete(k); }); return s.watchers.size; };
const summary = (s: LiveSession) => ({ projectId: s.projectId, name: s.name, live: isLive(s), source: s.source, actor: s.actor?.label ?? null, updatedAt: s.updatedAt, playing: s.playing, time: s.time, clips: s.timeline.clips.length, watchers: watchers(s), rev: s.rev });

export function registerLiveRoutes(app: Express) {
  // Editors publish their working copy. The response tells them whether anyone is watching.
  app.post("/api/live/:id/publish", requireScope("write"), (req, res) => {
    const id = String(req.params.id), s = session(id);
    if (!s) return res.status(404).json({ message: "project not found" });
    if (!projectAllowed((req as any).apiKey, id)) return res.status(403).json({ message: "Project is outside this API key's restrictions." });
    try {
      const actor = actorOf(req), b = req.body || {}, before = `${s.time}|${s.selectedId}|${s.playing}|${s.name}`;
      if (b.timeline) { if (!Array.isArray(b.timeline.clips)) throw new Error("timeline.clips must be an array"); syncTimeline(id, actor, normalizeTimeline(b.timeline), "editor"); }
      if (typeof b.time === "number" && Number.isFinite(b.time)) s.time = Math.max(0, Math.round(b.time * 100) / 100);
      s.selectedId = typeof b.selectedId === "string" ? b.selectedId.slice(0, 64) : null;
      s.playing = !!b.playing;
      if (typeof b.name === "string") s.name = b.name.slice(0, 200);
      s.actor = actor; s.editorAt = Date.now(); s.updatedAt = s.editorAt; if (s.source === "idle") s.source = "editor";
      if (before !== `${s.time}|${s.selectedId}|${s.playing}|${s.name}`) s.rev++;
      res.json({ ok: true, watchers: watchers(s) });
    } catch (e: any) { res.status(400).json({ message: e.message || "bad request" }); }
  });

  // Activity feed for one project. Any key that can read the project can read it.
  app.get("/api/projects/:id/activity", requireScope("read"), (req, res) => {
    const id = String(req.params.id), s = session(id);
    if (!s || !projectAllowed((req as any).apiKey, id)) return res.status(404).json({ message: "project not found" });
    const since = Number(req.query.since ?? 0) || 0;
    res.json({ activity: s.activity.filter((a) => a.seq > since || a.count > 1 && a.ts > Date.now() - MERGE_MS * 2).slice(-100) });
  });

  // ---- master admin, view-only ----
  // Every project with its live status, freshest first.
  app.get("/api/live", requireAdmin, (_req, res) => {
    const list = storage.listProjects().map((p) => session(p.id)).filter(Boolean).map((s) => summary(s!));
    list.sort((a, b) => Number(b.live) - Number(a.live) || b.updatedAt - a.updatedAt);
    res.json({ now: Date.now(), refreshMs: 100, sessions: list });
  });

  // Poll with ?since=<rev>&tsince=<timelineRev>. Unchanged polls return a few bytes.
  app.get("/api/live/:id", requireAdmin, (req, res) => {
    const s = session(String(req.params.id));
    if (!s) return res.status(404).json({ message: "project not found" });
    const watcher = actorOf(req); s.watchers.set(watcher.id, Date.now());
    res.setHeader("Cache-Control", "no-store");
    const since = Number(req.query.since ?? -1), tsince = Number(req.query.tsince ?? -1);
    const base = { rev: s.rev, timelineRev: s.timelineRev, live: isLive(s), now: Date.now() };
    if (since === s.rev) return res.json({ ...base, changed: false });
    res.json({ ...base, changed: true, name: s.name, time: s.time, selectedId: s.selectedId, playing: s.playing, actor: s.actor?.label ?? null, source: s.source, updatedAt: s.updatedAt, watchers: watchers(s),
      timeline: tsince === s.timelineRev ? undefined : s.timeline, activity: s.activity.slice(-80) });
  });
}
