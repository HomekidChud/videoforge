// Motion graphics tutorial: the steps of docs/motion-graphics-tutorial.md, performed in the Studio.
export const title = "Motion graphics tutorial";

export async function run(rec, { page, only }) {
  const run = (id) => !only || only.includes(id);
  const S = (id, title, steps, o) => (run(id) ? rec.section(id, title, steps, o) : null);
  const inspector = ".inspector";
  const addTitleAndWait = async () => { await rec.click('[data-testid="button-add-title"]'); await page.waitForSelector('[data-testid="input-title-text"]'); };

  await S("intro", "Introduction", [
    async () => { await rec.hover(".dock", { dy: 0.2 }); await rec.zoom(".library", 1.35); },
    async () => { await rec.hover(".preview-empty", { dy: 0.4 }); rec.zoomOut(); },
    async () => { await rec.hover(".timeline-panel", { dx: 0.5, dy: 0.5 }); await rec.zoom(".timeline-panel", 1.3); },
  ]);

  await S("start", "Start the project", [
    async () => { await rec.type('[data-testid="input-project-title"]', "Animated intro"); await rec.key("Tab"); },
    async () => { await rec.zoom(inspector, 1.5); await rec.hover(inspector, { dy: 0.2 }); },
    async () => { await rec.color("Background color", "#101826"); },
  ]);

  await S("headline", "Add a headline", [
    async () => { await rec.zoom('[data-testid="button-add-title"]', 1.5); await addTitleAndWait(); },
    async () => { await rec.zoom(inspector, 1.5); await rec.type('[data-testid="input-title-text"]', "Make your move"); },
    async () => { await rec.range("Size", 10); await rec.select("Font", "Poppins"); await rec.click("button >> text=/^Bold$/"); },
    async () => { await rec.range("Vertical", 0.44); await rec.number("Duration", 5); },
  ]);

  await S("spring", "Make it spring in", [
    async () => { await rec.click('[data-testid="tab-motion"]'); },
    async () => { await rec.expand("Motion presets"); await rec.number("Preset duration", 0.9, { aria: true }); },
    async () => { await rec.click('[data-testid="motion-spring"]'); },
    async () => { rec.zoomOut(); await rec.click('[data-testid="button-play"]'); await new Promise((r) => setTimeout(r, 1900)); await rec.click('[data-testid="button-play"]'); },
  ]);

  await S("bar", "Add an accent bar", [
    async () => { await rec.click('[data-testid="tab-graphics"]'); },
    async () => { await rec.click('[data-testid="add-shape-rectangle"]'); await page.waitForSelector('input[type=range][aria-label="Shape width"]'); await rec.zoom(inspector, 1.5); },
    async () => { await rec.range("Shape width", 0.22); await rec.range("Shape height", 0.012); await rec.color("Shape fill", "#f6a447"); },
    async () => { await rec.number("Start", 0.3); await rec.number("Duration", 4.7); await rec.range("Vertical", 0.56); },
    async () => { await rec.click('[data-testid="tab-motion"]'); await rec.expand("Motion presets"); await rec.number("Preset duration", 0.7, { aria: true }); await rec.click('[data-testid="motion-reveal"]'); },
  ]);

  await S("tagline", "Add a tagline", [
    async () => { await addTitleAndWait(); await rec.zoom(inspector, 1.5); },
    async () => { await rec.type('[data-testid="input-title-text"]', "Motion graphics, made in the Studio"); },
    async () => { await rec.range("Size", 3.5); await rec.select("Font", "Poppins"); await rec.color("Text color", "#9fb3c8"); },
    async () => { await rec.range("Vertical", 0.62); await rec.number("Start", 0.5); await rec.number("Duration", 4.5); },
    async () => { await rec.click('[data-testid="tab-motion"]'); await rec.expand("Motion presets"); await rec.number("Preset duration", 0.6, { aria: true }); await rec.click('[data-testid="motion-rise"]'); },
  ]);

  await S("badge", "Add a badge that keeps moving", [
    async () => { await rec.click('[data-testid="tab-graphics"]'); await rec.click('[data-testid="add-shape-ellipse"]'); await page.waitForSelector('input[type=range][aria-label="Shape width"]'); await rec.zoom(inspector, 1.5); },
    async () => { await rec.range("Shape width", 0.07); await rec.range("Shape height", 0.124); await rec.color("Shape fill", "#f6a447"); },
    async () => { await rec.range("Vertical", 0.22); await rec.number("Duration", 5); },
    async () => { await rec.click('[data-testid="tab-motion"]'); await rec.expand("Animate with code"); },
    async () => { await rec.select("Code recipe", "Float"); await rec.click('[data-testid="code-recipe"]'); },
  ]);

  await S("lower-third", "Drop in a lower third", [
    async () => {
      rec.zoomOut();
      const tick = page.locator('[data-testid="ruler"]').locator("text=/^2s$/").first();
      const b = await tick.boundingBox().catch(() => null);
      const r = await page.locator('[data-testid="ruler"]').boundingBox();
      await rec.moveTo((b ? b.x : r.x + r.width * 0.1) + 3, r.y + r.height / 2);
      await rec.zoom('[data-testid="ruler"]', 1.4);
      await page.mouse.down(); await page.mouse.up(); await new Promise((r) => setTimeout(r, 600));
    },
    async () => { await rec.click('[data-testid="tab-graphics"]'); await rec.zoom(".library", 1.4); },
    async () => { await rec.click('[data-testid="template-lower-third"]'); },
    async () => { await rec.type('[data-testid="graphics-title"]', "Ada Lovelace"); await rec.type("label.field:has-text('Supporting text') input", "Pioneer of computing"); },
    async () => { await rec.type("label.field:has-text('Duration (s)') input >> nth=0", "3"); await rec.key("Enter"); await rec.click('[data-testid="button-insert-template"]'); },
  ]);

  await S("graph", "Tune the motion on a graph", [
    async () => { rec.zoomOut(); await rec.click('[data-testid="workspace-animate"]'); },
    async () => { await rec.click('[data-testid^="layer-select-"] >> text=Make your move'); },
    async () => { await rec.click('[data-testid="add-keyframe"]'); await rec.zoom(".timeline-panel", 1.3); },
    async () => { await rec.click('[data-testid="workspace-edit"]'); rec.zoomOut(); },
  ]);

  await S("fade", "Fade everything out", [
    async () => { await rec.click('[data-testid^="layer-select-"] >> text=Make your move'); await rec.click('[data-testid="tab-edit"]'); await rec.zoom(inspector, 1.5); },
    async () => { await rec.range("Fade out", 0.6); },
    async () => { await rec.click('[data-testid^="layer-select-"] >> text=Motion graphics, made in the Studio'); await rec.range("Fade out", 0.6); },
  ]);

  await S("playback", "Check the fit and play it back", [
    async () => { await rec.click('[data-testid="button-project-settings"]'); await rec.zoom(inspector, 1.4); },
    async () => { const fit = page.locator('[data-testid="fit-all"]'); if (!(await fit.evaluate((n) => n.disabled).catch(() => true))) await rec.click(fit); rec.zoomOut(); },
    async () => { await rec.click('role=button[name="Jump to start"]'); await rec.click('[data-testid="button-play"]'); await new Promise((r) => setTimeout(r, 5400)); await rec.click('[data-testid="button-play"]'); },
  ]);

  await S("export", "Export your video", [
    async () => { await rec.zoom('[data-testid="button-export"]', 1.5); await rec.click('[data-testid="button-export"]'); },
    async () => { rec.zoomOut(); await new Promise((r) => setTimeout(r, 4200)); await rec.click('role=button[name="Close export panel"]'); },
  ]);

  await S("outro", "Summary", [
    async () => { await rec.hover(".preview-stage, .preview-media, .preview", { dy: 0.5 }).catch(() => {}); },
    async () => { await rec.click('[data-testid="button-play"]'); await new Promise((r) => setTimeout(r, 5200)); await rec.click('[data-testid="button-play"]'); },
  ]);
}
