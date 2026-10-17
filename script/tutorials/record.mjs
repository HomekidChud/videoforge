// Records one tutorial.   xvfb-run -a -s "-screen 0 1920x1080x24" node script/tutorials/record.mjs <id> [onlySectionId,...]
import fs from "node:fs";
import path from "node:path";
import { ROOT, sleep, startServer, openStudio, Recorder } from "./lib.mjs";

const id = process.argv[2];
if (!id) { console.error("usage: record.mjs <tutorial id>"); process.exit(1); }
const only = process.argv[3] ? process.argv[3].split(",") : null;
const scene = await import(`./scenes/${id}.mjs`);
const outDir = path.join(ROOT, "script/tutorials/work", id);
const audioDir = path.join(ROOT, "script/tutorials/audio");

const srv = await startServer({ port: 5310 + (scene.port ?? 0), db: `/tmp/vf-tut-${id}.db` });
const { ctx, page } = await openStudio(srv, { advanced: true, start: scene.start ?? "#/editor" });
await page.waitForSelector(scene.ready ?? '[data-testid="button-add-title"]', { timeout: 60000 });
await sleep(2500);
page.setDefaultTimeout(8000);
page.on("pageerror", (e) => console.log("PAGEERROR", String(e.stack || e).slice(0, 600)));
page.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE", m.text().slice(0, 400)); });
page.on("framenavigated", (f) => { if (f === page.mainFrame()) console.log("NAV", f.url()); });
const rec = new Recorder({ page, tutorial: id, outDir, audioDir });
await rec.start();
await sleep(600);
const env = { srv, ctx, page, only };
await scene.run(rec, env);
await sleep(600);
const manifest = await rec.finish({ title: scene.title });
await ctx.close();
srv.stop();
console.log(JSON.stringify({ duration: manifest.duration, sections: manifest.sections.map((s) => [s.id, s.start, s.end]), problems: manifest.problems }, null, 1));
process.exit(0);
