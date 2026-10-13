import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import type * as z from "zod/mini";

// ============================================================================
// TIMELINE MODEL — shared by the web editor UI and the agent API.
// Every clip is a reference to a media asset plus in/out trim points and
// optional overlays (text captions). Audio is per-clip (volume, muted).
// ============================================================================

export const ClipSchemaJSON = {
  id: "text", // unique per project
  assetId: "text", // -> media asset
  track: "text", // 'video' | 'audio' | 'overlay'
  start: "real", // timeline start (s)
  inPoint: "real", // trim start within source (s)
  outPoint: "real", // trim end within source (s)
  volume: "real", // 0..1
  muted: "integer", // 0/1
  text: "text", // overlay caption
} as const;

export const MediaAssetSchemaJSON = {
  id: "text", // short unique id
  filename: "text",
  kind: "text", // 'video' | 'audio' | 'image'
  mime: "text",
  duration: "real", // seconds
  width: "integer",
  height: "integer",
  sizeBytes: "integer",
  uploadUrl: "text", // /api/media/:id/raw (streaming)
  thumbnailUrl: "text", // /api/media/:id/thumb
  createdAt: "integer", // epoch ms
} as const;

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

export const mediaAssets = sqliteTable("media_assets", {
  id: text("id").primaryKey(),
  filename: text("filename").notNull(),
  kind: text("kind").notNull(), // video | audio | image
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
  visibility: text("visibility").notNull().default("private"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const renderJobs = sqliteTable("render_jobs", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  status: text("status").notNull(), // queued | rendering | done | error
  progress: real("progress").notNull().default(0),
  outputPath: text("output_path"),
  error: text("error"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

// ---------------------------------------------------------------------------
// API keys — used by external AI agents & scripts. Never store the plaintext
// key, only sha256(key). `scope` is "read" | "write" | "admin".
// ---------------------------------------------------------------------------
export const apiKeys = sqliteTable("api_keys", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  scope: text("scope").notNull(), // read | write | admin
  keyHash: text("key_hash").notNull(),
  restrictionsJson: text("restrictions_json").notNull().default("{}"),
  lastUsedAt: integer("last_used_at"),
  revoked: integer("revoked").notNull().default(0),
  createdAt: integer("created_at").notNull(),
});

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
  visibility: true,
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
