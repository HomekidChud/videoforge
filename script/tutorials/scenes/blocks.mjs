// Block coding tutorial: name a set, add a title block, add a fade, repeat it for each clip, preview and apply.
export const title = "Block coding tutorial";
export const port = 2;

export async function run(rec, { page, only }) {
  const run = (id) => !only || only.includes(id);
  const S = (id, title, steps, o) => (run(id) ? rec.section(id, title, steps, o) : null);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const canvas = () => page.locator('[data-testid="bs-canvas"]').boundingBox();
  const node = (text) => page.locator(".react-flow__node").filter({ hasText: text }).first();
  const handle = (text, id) => node(text).locator(`.react-flow__handle[data-handleid="${id}"]`).first();

  /** Drag a block from the palette onto the canvas, at a place given as fractions of the canvas box. */
  const dropChip = async (label, fx, fy) => {
    const chip = page.locator(".bs-chip").filter({ hasText: label }).first();
    const from = await rec.rectOf(chip);
    const c = await canvas();
    await rec.moveTo(from.x + 28, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + 60, from.y + from.height / 2 + 20, { steps: 6 });
    await rec.moveTo(c.x + c.width * fx, c.y + c.height * fy, 900);
    await page.mouse.up();
    await wait(700);
  };
  /** Draw a wire from one block's dot to another's. */
  const connect = async (fromText, fromHandle, toText, toHandle) => {
    const a = await handle(fromText, fromHandle).boundingBox();
    const b = await handle(toText, toHandle).boundingBox();
    await rec.moveTo(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    await rec.moveTo(b.x + b.width / 2, b.y + b.height / 2, 800);
    await page.mouse.up();
    await wait(600);
  };
  const zoomCanvasOut = async (times) => { for (let i = 0; i < times; i++) await rec.click(".react-flow__controls-zoomout", { wait: 250 }); };

  await S("intro", "Introduction", [
    async () => { await rec.click('[data-testid="tab-graphics"]'); await rec.click('[data-testid="add-shape-rectangle"]'); },
    async () => { await rec.click('[data-testid="add-shape-ellipse"]'); },
    async () => { await rec.hover(".timeline-panel", { dx: 0.5, dy: 0.5 }); },
  ]);

  await S("open", "Open the block studio", [
    async () => { await rec.zoom('[data-testid="tab-blocks"]', 1.6); await rec.click('[data-testid="tab-blocks"]'); await page.waitForSelector('[data-testid="bs-canvas"]'); await wait(900); },
    async () => { rec.zoomOut(); const skip = page.locator('[data-testid="bs-tutorial-skip"]'); if (await skip.count()) await rec.click(skip); },
    async () => { await rec.zoom('[data-testid="bs-tutorial-open"]', 1.6); await rec.hover('[data-testid="bs-tutorial-open"]'); await wait(600); },
    async () => { rec.zoomOut(); await rec.hover('[data-testid="bs-palette"]', { dy: 0.3 }); },
  ]);

  await S("start", "Start from the green block", [
    async () => { await rec.zoom(node("When Apply"), 1.4); await rec.hover(node("When Apply")); },
    async () => { const sel = page.locator('[data-testid="bs-start-scope"]'); await rec.fakeClick(sel); await sel.selectOption({ label: "Every clip" }); await wait(500); },
    async () => { rec.zoomOut(); await rec.zoom('[data-testid="bs-name"]', 1.6); await rec.type('[data-testid="bs-name"]', "Title every clip"); await rec.key("Tab"); },
  ]);

  await S("chain", "Add a title block", [
    async () => { rec.zoomOut(); await rec.hover(node("Add title")); },
    async () => { await rec.zoom(handle("When Apply", "next"), 1.8); await rec.hover(handle("When Apply", "next")); await wait(600); },
    async () => { rec.zoomOut(); await rec.type('[data-testid="bs-param-text"]', "Made with blocks"); await rec.key("Tab"); },
  ]);

  await S("fade", "Add a fade", [
    async () => { await zoomCanvasOut(2); },
    async () => { await rec.click('[data-testid="bs-cat-Animate"]'); },
    async () => { await dropChip("Fade in slowly", 0.12, 0.6); },
    async () => { await rec.zoom(node("Fade in slowly"), 1.4); await rec.hover(node("Fade in slowly")); await wait(600); },
  ]);

  await S("loop", "Repeat for each clip", [
    async () => { rec.zoomOut(); await rec.click('[data-testid="bs-cat-Flow"]'); },
    async () => { await dropChip("For each clip", 0.74, 0.6); },
    async () => { await connect("Add title", "next", "For each clip", "in"); },
    async () => { await connect("For each clip", "body", "Fade in slowly", "in"); },
    async () => { const sel = node("For each clip").locator("select").first(); await rec.fakeClick(sel); await sel.selectOption("all"); await wait(700); },
  ]);

  await S("preview", "Preview, then apply", [
    async () => { await rec.zoom('[data-testid="bs-preview"]', 1.6); await rec.click('[data-testid="bs-preview"]'); await wait(1500); },
    async () => { rec.zoomOut(); await rec.hover(".bs-preview, [data-testid='bs-preview-panel']", { dy: 0.5 }).catch(() => {}); await wait(1500); },
    async () => { await rec.zoom('[data-testid="bs-run"]', 1.6); await rec.click('[data-testid="bs-run"]'); await wait(1500); },
    async () => { rec.zoomOut(); await wait(1200); },
  ]);

  await S("save", "Save, share and reuse", [
    async () => { await rec.zoom('[data-testid="bs-share"]', 1.6); await rec.hover('[data-testid="bs-share"]'); await wait(900); },
    async () => { rec.zoomOut(); await rec.click('[data-testid="bs-tab-code"]'); await wait(1800); },
    async () => { await rec.click('[data-testid="bs-tab-blocks"]'); },
  ]);

  await S("outro", "Summary", [
    async () => { await rec.hover(node("For each clip")); },
    async () => { await rec.click('[data-testid="bs-close"]'); },
  ]);
}
