import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import type * as z from "zod/mini";

// ============================================================================
// TIMELINE MODEL — shared by the web editor UI and the agent API.
// Every clip is a reference to a media asset plus in/out trim points,
// transform (scale/rotate/flip/crop), visual filters (brightness, contrast,
// saturation, hue, blur, opacity), playback speed, fades and text overlays.
// ============================================================================

export const ClipSchemaJSON = {
  id: "text",
  assetId: "text",
  track: "text",
  start: "real",
  inPoint: "real",
  outPoint: "real",
  volume: "real",
  muted: "integer",
  text: "text",
  duration: "real",
  speed: "real",
  brightness: "real",
  contrast: "real",
  saturation: "real",
  hue: "real",
  blur: "real",
  opacity: "real",
  scale: "real",
  rotate: "real",
  flipH: "integer",
  flipV: "integer",
  cropTop: "real",
  cropBottom: "real",
  cropLeft: "real",
  cropRight: "real",
  fadeIn: "real",
  fadeOut: "real",
  audioFadeIn: "real",
  audioFadeOut: "real",
} as const;

export const MediaAssetSchemaJSON = {
  id: "text",
  filename: "text",
  kind: "text",
  mime: "text",
  duration: "real",
  width: "integer",
  height: "integer",
  sizeBytes: "integer",
  uploadUrl: "text",
  thumbnailUrl: "text",
  createdAt: "integer",
} as const;

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

export const mediaAssets = sqliteTable("media_assets", {
  id: text("id").primaryKey(),
  filename: text("filename").notNull(),
  kind: text("kind").notNull(),
  mime: text("mime").notNull(),
  duration: real("duration").notNull().default(0),
  hasAudio: integer("has_audio").notNull().default(0),
  width: integer("width").notNull().default(0),
  height: integer("height").notNull().default(0),
  sizeBytes: integer("size_bytes").notNull().default(0),
  storagePath: text("storage_path").notNull(),
  thumbPath: text("thumb_path"),
  createdAt: integer("created_at").notNull(),
});

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  timelineJson: text("timeline_json").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const renderJobs = sqliteTable("render_jobs", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  status: text("status").notNull(),
  progress: real("progress").notNull().default(0),
  outputPath: text("output_path"),
  error: text("error"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

// ---------------------------------------------------------------------------
// API keys. Two kinds:
//   - private  (vf_live_ / vf_admin_) — server-side secret, can hold any
//               permission. Never persist the plaintext; store sha256 only.
//   - public   (vf_pub_)   — safe to embed in a browser/app. Enforced
//               read-only + only explicitly allow-listed resources. Cannot
//               manage other keys or upload media.
// Fine-grained permissions replace the legacy coarse `scope`. The legacy
// scope is kept for backwards compatibility and maps onto permissions.
// Restrictions: expiry, allowed origins, allowed IPs/CIDRs, rate limit
// (req/hour), quota (total requests), and per-resource allow lists.
// ---------------------------------------------------------------------------

export const apiKeys = sqliteTable("api_keys", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  kind: text("kind").notNull().default("private"), // private | public
  scope: text("scope").notNull(), // legacy: read | write | admin
  permissions: text("permissions").notNull().default("[]"), // JSON string[]
  keyHash: text("key_hash").notNull(),
  revoked: integer("revoked").notNull().default(0),
  expiresAt: integer("expires_at").notNull().default(0), // 0 = never
  allowedOrigins: text("allowed_origins").notNull().default("[]"), // JSON string[]
  allowedIps: text("allowed_ips").notNull().default("[]"), // JSON string[] (IP/CIDR)
  rateLimitPerHour: integer("rate_limit_per_hour").notNull().default(0), // 0 = unlimited
  quotaTotal: integer("quota_total").notNull().default(0), // 0 = unlimited
  requestsUsed: integer("requests_used").notNull().default(0),
  lastUsedAt: integer("last_used_at").notNull().default(0),
  createdAt: integer("created_at").notNull(),
});

export const keyUsage = sqliteTable("key_usage", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  keyId: text("key_id").notNull(),
  method: text("method").notNull(),
  path: text("path").notNull(),
  status: integer("status").notNull(),
  createdAt: integer("created_at").notNull(),
});

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

export const PERMISSIONS = [
  "media:read",
  "media:upload",
  "media:delete",
  "projects:read",
  "projects:write",
  "timeline:edit",
  "renders:create",
  "renders:download",
  "keys:manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export function scopeToPermissions(scope: "read" | "write" | "admin"): Permission[] {
  if (scope === "admin") return [...PERMISSIONS];
  if (scope === "write")
    return [
      "media:read",
      "media:upload",
      "media:delete",
      "projects:read",
      "projects:write",
      "timeline:edit",
      "renders:create",
      "renders:download",
    ];
  return ["media:read", "projects:read", "renders:download"];
}

// ---------------------------------------------------------------------------
// TypeScript timeline model (stored as JSON in projects.timelineJson)
// ---------------------------------------------------------------------------

export type Clip = {
  id: string;
  assetId: string;
  track: "video" | "audio" | "overlay";
  start: number; // timeline seconds
  inPoint: number; // source seconds
  outPoint: number; // source seconds
  volume: number; // 0..1
  muted: boolean;
  text?: string; // caption text for overlay clips
  duration?: number; // for image clips (still images shown this long)
  speed?: number; // playback speed multiplier (0.25..4)
  brightness?: number; // 0..2 (1 = normal)
  contrast?: number; // 0..2
  saturation?: number; // 0..2
  hue?: number; // -180..180 degrees
  blur?: number; // 0..10
  opacity?: number; // 0..1
  scale?: number; // 0.1..4
  rotate?: number; // -180..180 degrees
  flipH?: boolean;
  flipV?: boolean;
  cropTop?: number; // 0..0.9 fraction of height
  cropBottom?: number;
  cropLeft?: number; // 0..0.9 fraction of width
  cropRight?: number;
  fadeIn?: number; // seconds
  fadeOut?: number; // seconds
  audioFadeIn?: number; // seconds
  audioFadeOut?: number; // seconds
};

export type Timeline = {
  version: number;
  fps: number;
  resolution: { width: number; height: number };
  clips: Clip[];
};

export type Asset = typeof mediaAssets.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type RenderJob = typeof renderJobs.$inferSelect;
export type ApiKey = typeof apiKeys.$inferSelect;

export const insertMediaAssetSchema = createInsertSchema(mediaAssets).pick({
  id: true,
  filename: true,
  kind: true,
  mime: true,
  duration: true,
  hasAudio: true,
  width: true,
  height: true,
  sizeBytes: true,
  storagePath: true,
  thumbPath: true,
  createdAt: true,
});

export const insertProjectSchema = createInsertSchema(projects).pick({
  id: true,
  name: true,
  timelineJson: true,
  createdAt: true,
  updatedAt: true,
});

export const insertRenderJobSchema = createInsertSchema(renderJobs).pick({
  id: true,
  projectId: true,
  status: true,
  progress: true,
  outputPath: true,
  error: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertMediaAsset = z.infer<typeof insertMediaAssetSchema>;
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type InsertRenderJob = z.infer<typeof insertRenderJobSchema>;
