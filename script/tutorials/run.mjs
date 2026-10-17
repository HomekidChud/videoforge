// Records and edits tutorial videos: node script/tutorials/run.mjs [id ...]
// With no ids every tutorial is rebuilt. Uses a virtual display when none is available.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const ALL = ["mg", "tour", "animator", "blocks", "fire"];
const ids = process.argv.slice(2);
const targets = ids.length ? ids : ALL;
for (const id of targets) if (!ALL.includes(id)) { console.error(`Unknown tutorial "${id}". Choose from: ${ALL.join(", ")}`); process.exit(1); }

const hasDisplay = Boolean(process.env.DISPLAY) || process.platform !== "linux";
const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { stdio: "inherit" });
  if (r.status !== 0) { console.error(`Failed: ${cmd} ${args.join(" ")}`); process.exit(r.status ?? 1); }
};
for (const id of targets) {
  console.log(`\nRecording ${id}`);
  const rec = ["script/tutorials/record.mjs", id];
  if (hasDisplay) run("node", rec);
  else run("xvfb-run", ["-a", "-s", "-screen 0 1920x1080x24", "node", ...rec]);
  console.log(`Editing ${id}`);
  run("npx", ["tsx", "script/tutorials/edit.ts", id]);
}
if (!existsSync("client/public/videos")) process.exit(1);
console.log("\nDone. Videos are in client/public/videos.");
