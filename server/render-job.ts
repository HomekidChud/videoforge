import { buildRenderPlan, runFfmpeg } from "./render";
import type { Asset } from "@shared/schema";
import type { Timeline } from "@shared/timeline";
import type { RenderOptions } from "@shared/render-options";

export type RenderJobInput = {
  timeline: Timeline; assets: Map<string, Asset>; mediaDir: string; tmpDir: string; jobId: string; outPath: string;
  options: RenderOptions; onProgress: (pct: number) => void;
};
export async function renderProject(i: RenderJobInput): Promise<{ code: number | null; stderrTail: string }> {
  const plan = buildRenderPlan(i.timeline, i.assets, i.mediaDir, i.tmpDir, i.jobId, i.outPath, i.options);
  try { return await runFfmpeg(plan.args, plan.total, i.onProgress); }
  finally { plan.tempFiles.forEach((f) => { try { process.env.X; } catch { /* ignore */ } }); }
}
