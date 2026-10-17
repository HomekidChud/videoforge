// Fire edit tutorial: one imported clip becomes two graded cuts with a dissolve, graphics and an export.
import path from "node:path";
import { ROOT } from "../lib.mjs";

export const title = "Fire edit tutorial";
export const port = 4;

export async function run(rec, { page, only }) {
  const run = (id) => !only || only.includes(id);
  const S = (id, title, steps, o) => (run(id) ? rec.section(id, title, steps, o) : null);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const inspector = ".inspector";
  const footage = path.join(ROOT, "script/tutorials/assets/demo-footage.mp4");
  const addTitleAndWait = async () => { await rec.click('[data-testid="button-add-title"]'); await page.waitForSelector('[data-testid="input-title-text"]'); };
  const videoClips = () => page.locator('[data-testid="lane-video"] [data-testid^="clip-"]');

  await S("intro", "Introduction", [
    async () => { await rec.hover(".preview-empty", { dy: 0.4 }); },
    async () => { await rec.zoom(".library", 1.4); await rec.hover(".library", { dy: 0.5 }); },
    async () => { rec.zoomOut(); await rec.hover(".timeline-panel", { dx: 0.5, dy: 0.5 }); },
  ]);

  await S("clip", "Get the clip in", [
    async () => {
      await rec.zoom('[data-testid="empty-import"]', 1.5);
      const [chooser] = await Promise.all([page.waitForEvent("filechooser"), rec.click('[data-testid="empty-import"]')]);
      await chooser.setFiles(footage);
      await page.waitForSelector('[data-testid^="card-asset-"]', { timeout: 20000 });
      await wait(900);
    },
    async () => { rec.zoomOut(); await rec.zoom(".library", 1.5); await rec.click('[data-testid^="card-asset-"] button >> nth=0'); await page.waitForSelector('[data-testid^="clip-"]'); },
    async () => { rec.zoomOut(); await rec.type('[data-testid="input-project-title"]', "Fire edit"); await rec.key("Tab"); },
  ]);

  await S("trim", "Trim to the beat", [
    async () => { await rec.zoom(inspector, 1.5); await rec.hover(inspector, { dy: 0.5 }); },
    async () => { await rec.number("Out", 8); },
    async () => { rec.zoomOut(); await rec.zoom(".timeline-panel", 1.3); await wait(900); },
  ]);

  await S("second", "Make the second cut", [
    async () => { rec.zoomOut(); await rec.click("button >> text=/^Duplicate$/"); await wait(600); },
    async () => { await rec.zoom(inspector, 1.5); await rec.number("Start", 8); },
    async () => { await rec.number("In", 8); await rec.number("Out", 15.5); },
    async () => { rec.zoomOut(); await rec.zoom(".timeline-panel", 1.3); await wait(900); },
  ]);

  await S("look", "Warm the edit up", [
    async () => { rec.zoomOut(); await rec.click(videoClips().first()); },
    async () => { await page.keyboard.down("Shift"); await rec.click(videoClips().nth(1)); await page.keyboard.up("Shift"); await rec.zoom(inspector, 1.5); },
    async () => { const chip = page.locator('[aria-label="Filter for all"] button', { hasText: /^warm$/i }); await chip.scrollIntoViewIfNeeded(); await rec.click(chip); },
    async () => { rec.zoomOut(); await rec.hover(".preview-stage, .preview-media, .preview", { dy: 0.5 }).catch(() => {}); await wait(800); },
  ]);

  await S("headline", "Add the headline", [
    async () => { rec.zoomOut(); await rec.zoom('[data-testid="button-add-title"]', 1.5); await addTitleAndWait(); },
    async () => { await rec.zoom(inspector, 1.5); await rec.type('[data-testid="input-title-text"]', "Fire edit"); },
    async () => { await rec.range("Size", 10); await rec.select("Font", "Poppins"); await rec.click("button >> text=/^Bold$/"); },
    async () => { await rec.range("Vertical", 0.2); await rec.number("Start", 0); await rec.number("Duration", 15); },
    async () => { await rec.click('[data-testid="tab-motion"]'); await rec.expand("Motion presets"); await rec.number("Preset duration", 0.9, { aria: true }); await rec.click('[data-testid="motion-spring"]'); },
  ]);

  await S("badge", "Add a badge that floats", [
    async () => { rec.zoomOut(); await rec.click('[data-testid="tab-graphics"]'); await rec.click('[data-testid="add-shape-ellipse"]'); await page.waitForSelector('input[type=range][aria-label="Shape width"]'); await rec.zoom(inspector, 1.5); },
    async () => { await rec.range("Shape width", 0.07); await rec.range("Shape height", 0.124); await rec.color("Shape fill", "#f6a447"); },
    async () => { await rec.range("Vertical", 0.68); await rec.number("Duration", 15); },
    async () => { await rec.click('[data-testid="tab-motion"]'); await rec.expand("Animate with code"); },
    async () => { await rec.select("Code recipe", "Float"); await rec.click('[data-testid="code-recipe"]'); },
  ]);

  await S("lower", "Add the lower third", [
    async () => {
      rec.zoomOut();
      const tick = page.locator('[data-testid="ruler"]').locator("text=/^2s$/").first();
      const b = await tick.boundingBox().catch(() => null);
      const r = await page.locator('[data-testid="ruler"]').boundingBox();
      await rec.moveTo((b ? b.x : r.x + r.width * 0.1) + 3, r.y + r.height / 2);
      await rec.zoom('[data-testid="ruler"]', 1.4);
      await page.mouse.down(); await page.mouse.up(); await wait(600);
    },
    async () => { await rec.click('[data-testid="tab-graphics"]'); await rec.zoom(".library", 1.4); },
    async () => { await rec.click('[data-testid="template-lower-third"]'); },
    async () => { await rec.type('[data-testid="graphics-title"]', "Fire edit"); await rec.type("label.field:has-text('Supporting text') input", "Cut, graded, exported"); },
    async () => { await rec.type("label.field:has-text('Duration (s)') input >> nth=0", "4"); await rec.key("Enter"); await rec.click('[data-testid="button-insert-template"]'); },
  ]);

  await S("dissolve", "Join the cuts with a dissolve", [
    async () => { rec.zoomOut(); await rec.click(videoClips().nth(1)); },
    async () => { await rec.zoom(inspector, 1.5); const chip = page.locator('[aria-label="Transition"] button', { hasText: /^dissolve$/i }); await chip.scrollIntoViewIfNeeded(); await rec.click(chip); },
    async () => { await rec.number("Length", 0.5); rec.zoomOut(); },
    async () => { await rec.zoom(".timeline-panel", 1.3); await wait(1200); },
  ]);

  await S("export", "Check it, then export", [
    async () => { rec.zoomOut(); await rec.click('role=button[name="Jump to start"]'); await rec.click('[data-testid="button-play"]'); await wait(7000); },
    async () => { await rec.click('[data-testid="button-play"]'); await rec.zoom('[data-testid="button-export"]', 1.5); await rec.click('[data-testid="button-export"]'); },
    async () => { rec.zoomOut(); await wait(5000); await rec.click('role=button[name="Close export panel"]'); },
  ]);

  await S("outro", "Summary", [
    async () => { await rec.hover(".preview-stage, .preview-media, .preview", { dy: 0.5 }).catch(() => {}); },
    async () => { await rec.click('role=button[name="Jump to start"]'); await rec.click('[data-testid="button-play"]'); await wait(6500); await rec.click('[data-testid="button-play"]'); },
  ]);
}
