// Studio tour: the dock, workspaces, timeline, inspector, command palette and shortcut sheet.
export const title = "Studio tour";

export async function run(rec, { page, only }) {
  const run = (id) => !only || only.includes(id);
  const S = (id, title, steps, o) => (run(id) ? rec.section(id, title, steps, o) : null);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const tab = (id) => `[data-testid="tab-${id}"]`;
  const ws = (id) => `[data-testid="workspace-${id}"]`;

  await S("intro", "Introduction", [
    async () => { await rec.hover(".preview-empty", { dy: 0.4 }); },
    async () => { await rec.zoom(".dock", 1.5); await rec.hover(".dock", { dy: 0.3 }); },
    async () => { rec.zoomOut(); await rec.hover(".timeline-panel", { dx: 0.5, dy: 0.4 }); },
  ]);

  await S("dock", "The tool dock", [
    async () => { await rec.zoom(".dock", 1.7); await rec.hover(tab("media")); },
    async () => { await rec.click(tab("effects")); },
    async () => { await rec.click(tab("graphics")); },
    async () => { await rec.click(tab("media")); rec.zoomOut(); },
  ]);

  await S("workspaces", "Workspaces", [
    async () => { await rec.zoom(".preset-switch", 1.6); await rec.hover(ws("edit")); },
    async () => { await rec.click(ws("animate")); },
    async () => { await rec.click(ws("graphics")); },
    async () => { await rec.click(ws("audio")); },
    async () => { await rec.click(ws("edit")); rec.zoomOut(); },
  ]);

  await S("timeline", "The timeline", [
    async () => { await rec.click('[data-testid="button-add-title"]'); await page.waitForSelector('[data-testid="input-title-text"]'); await rec.type('[data-testid="input-title-text"]', "Studio tour"); },
    async () => { await rec.click(tab("graphics")); await rec.click('[data-testid="add-shape-rectangle"]'); },
    async () => { await rec.zoom('[data-testid="timeline"]', 1.4); await rec.click('[data-testid="collapse-audio"]'); },
    async () => { await rec.click('[data-testid="collapse-video"]'); await rec.click('[data-testid="collapse-audio"]'); await rec.click('[data-testid="collapse-video"]'); },
    async () => { await rec.hover('[data-testid="ruler"]', { dx: 0.4 }); rec.zoomOut(); },
  ]);

  await S("inspector", "The inspector", [
    async () => { await rec.zoom(".inspector", 1.5); await rec.click('[data-testid="inspector-search"]'); },
    async () => { await rec.type('[data-testid="inspector-search"]', "opacity", { clear: true }); },
    async () => { await rec.type('[data-testid="inspector-search"]', "", { clear: true }); await rec.click('[data-testid="button-studio-tools"]'); },
    async () => { await rec.click('[data-testid="toggle-mode"]'); },
    async () => { await rec.hover(".inspector", { dy: 0.6 }); await page.keyboard.press("Escape"); },
  ]);

  await S("palette", "The command palette", [
    async () => { rec.zoomOut(); await rec.key("Control+k", 900); },
    async () => { await page.keyboard.type("split", { delay: 120 }); await wait(900); },
    async () => { await page.keyboard.press("Control+a"); await page.keyboard.type("export", { delay: 120 }); await wait(900); },
    async () => { await page.keyboard.press("Escape"); await wait(500); },
  ]);

  await S("shortcuts", "Keyboard shortcuts", [
    async () => { await page.locator("body").click({ position: { x: 700, y: 330 } }).catch(() => {}); await rec.key("?", 1200); },
    async () => { await rec.hover('[data-testid="shortcut-sheet"]', { dy: 0.3 }); await wait(1500); },
    async () => { await rec.hover('[data-testid="shortcut-sheet"]', { dy: 0.75 }); await wait(1500); await page.keyboard.press("Escape"); },
  ]);

  await S("outro", "Summary", [
    async () => { await rec.hover(".preview-stage, .preview-wrap, .preview", { dy: 0.5 }); },
    async () => { await rec.hover(".dock", { dy: 0.5 }); },
  ]);
}
