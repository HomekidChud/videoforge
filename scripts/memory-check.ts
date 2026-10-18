/** Manual memory validation (not part of the test suite): renders a 24-clip
 *  1080x1920 timeline through the windowed path and measures the real RSS of
 *  every ffmpeg pass, plus a frame-preview pass, against a 512MB budget. */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildRenderPlan, planRenderWindows } from "../server/render";
import { normalizeTimeline } from "../shared/timeline";
import type { Asset } from "@shared/schema";

const ROOT = path.resolve(import.meta.dirname, "..");
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), "vf-mem-"));
const MEDIA = path.join(WORK, "media");
fs.mkdirSync(MEDIA, { recursive: true });

const ff = (args: string[]) => {
  const r = spawnSync("ffmpeg", ["-y", "-v", "error", ...args], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${r.stderr.slice(-300)}`);
};

/** Peak RSS (MB) of a process and all its descendants while it runs. */
async function runMeasured(args: string[], label: string): Promise<void> {
  const child = spawn("ffmpeg", ["-y", "-v", "error", ...args], { stdio: ["ignore", "pipe", "pipe"] });
  let peak = 0;
  const treeRss = (pid: number): number => {
    let total = 0;
    try {
      const st = fs.readFileSync(`/proc/${pid}/status`, "utf8");
      total += (parseInt(st.match(/VmRSS:\s+(\d+)/)?.[1] ?? "0", 10)) / 1024;
      for (const tid of fs.readdirSync(`/proc/${pid}/task`)) {
        try {
          const kids = fs.readFileSync(`/proc/${pid}/task/${tid}/children`, "utf8").trim();
          for (const k of kids.split(/\s+/).filter(Boolean)) total += treeRss(Number(k));
        } catch {}
      }
    } catch {}
    return total;
  };
  const timer = setInterval(() => { peak = Math.max(peak, treeRss(child.pid!)); }, 100);
  let stderr = "";
  child.stderr.on("data", (d: Buffer) => { stderr += d; });
  await new Promise<void>((res) => child.on("exit", () => res()));
  clearInterval(timer);
  if (child.exitCode !== 0) throw new Error(`${label} failed: ${stderr.slice(-300)}`);
  console.log(`${label}: peak tree RSS ${peak.toFixed(0)} MB`);
}

const main = async () => {
  // 24 media files, 1080x1920, 3s each
  console.log("generating media...");
  const N = 24;
  for (let i = 0; i < N; i++) {
    ff(["-f", "lavfi", "-i", `color=c=0x2020${(20 + i * 8).toString(16).padStart(2, "0")}:s=1080x1920:d=3:r=24`,
      "-f", "lavfi", "-i", `sine=frequency=${300 + i * 40}:duration=3`,
      "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", "-f", "mp4",
      path.join(MEDIA, `m${i}`)]);
  }
  const assets = new Map(Array.from({ length: N }, (_, i) => {
    const a: Asset = { id: `m${i}`, filename: `m${i}`, kind: "video", mime: "video/mp4", duration: 3, width: 1080, height: 1920, sizeBytes: 0, hasAudio: 1, createdAt: "", probes: [] } as unknown as Asset;
    return [`m${i}`, a];
  }));

  const tl = normalizeTimeline({ fps: 24, resolution: { width: 1080, height: 1920 }, clips: Array.from({ length: N }, (_, i) => ({
    id: `c${i}`, assetId: `m${i}`, track: "video", start: i * 3, inPoint: 0, outPoint: 3, fadeIn: 0.3, fadeOut: 0.3,
  })) });

  const windows = planRenderWindows(tl, { quality: "standard" });
  console.log(`planned ${windows.length} windows (expected ~${N})`);
  const total = windows[windows.length - 1].end;

  // frame preview pass (the /frame endpoint shape), worst case at the stack point
  const framePlan = buildRenderPlan(tl, assets, MEDIA, WORK, "framecheck", path.join(WORK, "frame.png"), { frameAt: 0, width: 1080 });
  await runMeasured(framePlan.args, "frame preview (single frame, 1 input)");

  // all video chunks
  for (let i = 0; i < windows.length; i++) {
    const w = windows[i];
    const plan = buildRenderPlan(tl, assets, MEDIA, WORK, `mem${i}`, path.join(WORK, `seg${i}.mp4`), { quality: "standard", window: w });
    await runMeasured(plan.args, `chunk ${i + 1}/${windows.length} [${w.start.toFixed(2)},${w.end.toFixed(2)}]`);
    fs.rmSync(path.join(WORK, `seg${i}.mp4`), { force: true });
  }

  // audio pass
  const aplan = buildRenderPlan(tl, assets, MEDIA, WORK, "memaud", path.join(WORK, "aud.m4a"), { quality: "standard", window: { start: 0, end: total, audioOnly: true } });
  await runMeasured(aplan.args, "audio pass");

  const nodeRss = (fs.readFileSync("/proc/self/status", "utf8").match(/VmRSS:\s+(\d+)/)?.[1] ?? "0");
  console.log(`this node process: ${nodeRss} KB RSS (the API server idles ~75MB)`);
  console.log("DONE");
};
main().catch((e) => { console.error(e); process.exit(1); });
