/** Manual memory validation (not part of the test suite): renders a 24-clip
 *  1080x1920 timeline through the real windowed pipeline — chunks, audio pass,
 *  concat, mux — and measures the process-tree RSS of every ffmpeg pass against
 *  a 512MB budget, including a preview requested mid-export (which the ffmpeg
 *  lane must serialize rather than stack on top of the chunk). */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildRenderPlan, planRenderWindows, runFfmpeg } from "../server/render";
import { normalizeTimeline } from "../shared/timeline";
import type { Asset } from "@shared/schema";

const WORK = fs.mkdtempSync(path.join(os.tmpdir(), "vf-mem-"));
const MEDIA = path.join(WORK, "media");
fs.mkdirSync(MEDIA, { recursive: true });

const ff = (args: string[]) => {
  const r = spawnSync("ffmpeg", ["-y", "-v", "error", ...args], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${r.stderr.slice(-300)}`);
};

/** Sum of RSS of this process and every descendant, via /proc. */
function treeRssMb(root: number): number {
  const ppids = new Map<number, { ppid: number; rss: number }>();
  for (const d of fs.readdirSync("/proc")) {
    if (!/^\d+$/.test(d)) continue;
    try {
      const st = fs.readFileSync(`/proc/${d}/stat`, "utf8");
      const rest = st.slice(st.lastIndexOf(")") + 2).split(" ");
      const ppid = Number(rest[1]);
      const rssMb = Number(rest[21]) * (4096 / 1024 / 1024);
      ppids.set(Number(d), { ppid, rss: rssMb });    } catch {}
  }
  let total = 0;
  const walk = (pid: number) => {
    const e = ppids.get(pid);
    if (!e) return;
    total += e.rss;
    for (const [p, meta] of ppids) if (meta.ppid === pid) walk(p);
  };
  walk(root);
  return total;
}

/** Global peak of the whole node+ffmpeg tree while the script runs. */
let peakTree = 0;
const poller = setInterval(() => { peakTree = Math.max(peakTree, treeRssMb(process.pid)); }, 100);

const run = async (args: string[], label: string) => {
  const before = peakTree;
  const t0 = Date.now();
  const r = await runFfmpeg(args, 1, () => {});
  if (r.code !== 0) throw new Error(`${label} failed: ${r.stderrTail.slice(-300)}`);
  console.log(`${label}: ok in ${((Date.now() - t0) / 1000).toFixed(1)}s (tree peak so far ${Math.max(peakTree, before).toFixed(0)} MB)`);
  return r;
};

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
    const a = { id: `m${i}`, filename: `m${i}`, kind: "video", mime: "video/mp4", duration: 3, width: 1080, height: 1920, sizeBytes: 0, hasAudio: 1, createdAt: "", probes: [] } as unknown as Asset;
    return [`m${i}`, a];
  }));

  const tl = normalizeTimeline({ fps: 24, resolution: { width: 1080, height: 1920 }, clips: Array.from({ length: N }, (_, i) => ({
    id: `c${i}`, assetId: `m${i}`, track: "video", start: i * 3, inPoint: 0, outPoint: 3, fadeIn: 0.3, fadeOut: 0.3,
  })) });

  const windows = planRenderWindows(tl, { quality: "standard" });
  console.log(`planned ${windows.length} windows (expected ${N})`);
  const total = windows[windows.length - 1].end;

  // frame preview pass (the /frame endpoint shape: default 960 width)
  const framePlan = buildRenderPlan(tl, assets, MEDIA, WORK, "framecheck", path.join(WORK, "frame.png"), { frameAt: 0, width: 960 });
  await run(framePlan.args, "frame preview (single frame, 1 input, 960px)");

  // preview requested mid-export: fire a chunk and a preview together; the
  // ffmpeg lane must run them one at a time, never stacked.
  {
    // preview requested mid-export: fire a chunk and a preview together; the
    // ffmpeg lane must run them one at a time, never stacked. Verified by
    // counting live ffmpeg processes while both are in flight.
    const w = windows[0];
    const chunkPlan = buildRenderPlan(tl, assets, MEDIA, WORK, "lanechunk", path.join(WORK, "lanechunk.mp4"), { quality: "standard", window: w });
    const previewPlan = buildRenderPlan(tl, assets, MEDIA, WORK, "laneframe", path.join(WORK, "laneframe.png"), { frameAt: 1, width: 960 });
    let maxConcurrent = 0;
    const counter = setInterval(() => {
      let n = 0;
      for (const d of fs.readdirSync("/proc")) {
        if (!/^\d+$/.test(d)) continue;
        try { if (fs.readFileSync(`/proc/${d}/comm`, "utf8").trim() === "ffmpeg") n++; } catch {}
      }
      maxConcurrent = Math.max(maxConcurrent, n);
    }, 50);
    const t0 = peakTree;
    const both = await Promise.all([
      runFfmpeg(chunkPlan.args, 3, () => {}).then((r) => { if (r.code !== 0) throw new Error(r.stderrTail.slice(-200)); }),
      runFfmpeg(previewPlan.args, 1, () => {}).then((r) => { if (r.code !== 0) throw new Error(r.stderrTail.slice(-200)); }),
    ]);
    clearInterval(counter);
    console.log(`concurrency check: at most ${maxConcurrent} ffmpeg process(es) live at once (lane serializes: ${maxConcurrent <= 1 ? "yes" : "NO — BAD"})`);
    console.log(`tree peak with chunk + queued preview: ${Math.max(peakTree, t0).toFixed(0)} MB (the chunk alone is the ceiling)`);
    void both;
  }

  // the full export: every chunk, then audio, then concat+mux
  const chunks: string[] = [];
  for (let i = 0; i < windows.length; i++) {
    const w = windows[i];
    const plan = buildRenderPlan(tl, assets, MEDIA, WORK, `mem${i}`, path.join(WORK, `seg${i}.mp4`), { quality: "standard", window: w });
    // confirm the requested encoder settings are actually in the invocation
    if (i === 0) {
      const preset = plan.args[plan.args.indexOf("-preset") + 1], crf = plan.args[plan.args.indexOf("-crf") + 1];
      console.log(`encoder args: preset=${preset} crf=${crf} (standard = veryfast/20)`);
    }
    await run(plan.args, `chunk ${i + 1}/${windows.length} [${w.start.toFixed(2)},${w.end.toFixed(2)}]`);
    chunks.push(path.join(WORK, `seg${i}.mp4`));
  }
  const aplan = buildRenderPlan(tl, assets, MEDIA, WORK, "memaud", path.join(WORK, "aud.m4a"), { quality: "standard", window: { start: 0, end: total, audioOnly: true } });
  await run(aplan.args, "audio pass");

  const list = path.join(WORK, "list.txt");
  fs.writeFileSync(list, chunks.map((c) => `file '${c}'`).join("\n"));
  const out = path.join(WORK, "export.mp4");
  await run(["-y", "-hide_banner", "-f", "concat", "-safe", "0", "-i", list, "-i", path.join(WORK, "aud.m4a"), "-map", "0:v", "-map", "1:a", "-c", "copy", "-movflags", "+faststart", out], "concat + mux");

  // verify the finished export: duration, frame count, full decode
  const d = JSON.parse(spawnSync("ffprobe", ["-v", "error", "-print_format", "json", "-show_entries", "format=duration:stream=nb_frames,codec_type", out], { encoding: "utf8" }).stdout);
  const frames = d.streams.find((s: any) => s.codec_type === "video")?.nb_frames ?? 0;
  const dec = spawnSync("ffmpeg", ["-v", "error", "-i", out, "-f", "null", "-"], { encoding: "utf8" });
  console.log(`export: duration ${d.format.duration}s (expected ~${total}), frames ${frames} (expected ${Math.round(total * 24)}), full decode ${dec.status === 0 && !dec.stderr.trim() ? "clean" : `ERRORS: ${dec.stderr.slice(-200)}`}`);
  console.log(`peak tree RSS across the whole export: ${peakTree.toFixed(0)} MB (budget 512 MB)`);
  const nodeRss = (fs.readFileSync("/proc/self/status", "utf8").match(/VmRSS:\s+(\d+)/)?.[1] ?? "0");
  console.log(`node process: ${nodeRss} KB RSS (the API server idles ~75MB)`);
  console.log("DONE");
  clearInterval(poller);
};
main().catch((e) => { console.error(e); process.exit(1); });
