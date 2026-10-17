// Animator tutorial: rig the stick figure, pose one arm, ease the keys and bake the motion onto the edit.
export const title = "Animator tutorial";

export async function run(rec, { page, only }) {
  const run = (id) => !only || only.includes(id);
  const S = (id, title, steps, o) => (run(id) ? rec.section(id, title, steps, o) : null);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const part = (name) => page.locator('[data-testid^="an-part-"]').filter({ hasText: name }).first();

  // The ruler spans the animation length. These constants map a time in seconds to a point on it (length 3s).
  const scrub = async (t) => {
    const r = await page.locator('[data-testid="an-ruler"]').boundingBox();
    const f = (t + 0.0375) / 3.075;
    await rec.moveTo(r.x + r.width * f, r.y + 10);
    await page.mouse.down(); await page.mouse.up(); await wait(450);
  };
  const pose = async (prop, value) => {
    const loc = page.locator(`[data-testid="an-pose-${prop}"]`);
    await rec.click(loc, { wait: 150 });
    await page.keyboard.press("Control+a");
    await page.keyboard.type(String(value), { delay: 80 });
    await page.keyboard.press("Enter");
    await wait(600);
  };

  await S("intro", "Introduction", [
    async () => { await rec.hover(".preview-empty", { dy: 0.4 }); },
    async () => { await rec.zoom('[data-testid="button-studio-tools"]', 1.6); await rec.hover('[data-testid="button-studio-tools"]'); },
    async () => { rec.zoomOut(); await rec.hover(".timeline-panel", { dx: 0.5, dy: 0.4 }); },
  ]);

  await S("open", "Open the Animator", [
    async () => { await rec.zoom('[data-testid="button-studio-tools"]', 1.6); await rec.click('[data-testid="button-studio-tools"]'); },
    async () => { await rec.click('[data-testid="button-animator"]'); await page.waitForSelector('[data-testid="an-stick"]'); rec.zoomOut(); },
    async () => { await rec.zoom('[data-testid="an-stick"]', 1.6); await rec.click('[data-testid="an-stick"]'); },
    async () => { rec.zoomOut(); await rec.click('[data-testid="an-length"]', { wait: 150 }); await page.keyboard.press("Control+a"); await page.keyboard.type("3", { delay: 80 }); await page.keyboard.press("Tab"); await wait(500); },
  ]);

  await S("rig", "Meet the rig", [
    async () => { await rec.hover(part("Torso")); },
    async () => { await rec.click(part("Right upper arm")); },
    async () => { await rec.click(part("Right forearm")); await rec.zoom(part("Right forearm"), 1.5); },
    async () => { await rec.click("button >> text=/Joint & parent/"); },
    async () => { await rec.click("button >> text=/^Pose$/"); rec.zoomOut(); },
  ]);

  await S("pose", "Pose and key", [
    async () => { await scrub(0); },
    async () => { await rec.zoom('[data-testid="an-time"]', 1.4); await scrub(0.3); },
    async () => { rec.zoomOut(); await rec.zoom('[data-testid="an-pose-rotation"]', 1.6); await pose("rotation", -60); },
    async () => { rec.zoomOut(); await scrub(1.0); },
    async () => { await rec.zoom('[data-testid="an-pose-rotation"]', 1.6); await pose("rotation", 40); },
  ]);

  const selectTurnKey = async (t) => {
    // The Turn row of the selected part sits four rows below it once the rows are expanded.
    const h = await page.evaluateHandle((time) => {
      const rows = [...document.querySelectorAll(".an-lane-row")];
      const i = rows.findIndex((r) => r.classList.contains("on"));
      const row = rows[i + 4];
      if (!row) return null;
      const keys = [...row.querySelectorAll(".an-key")];
      return keys.length ? keys[time === "last" ? keys.length - 1 : 0] : null;
    }, t);
    const el = h.asElement();
    if (el) {
      await el.scrollIntoViewIfNeeded();
      const b = await el.boundingBox();
      await rec.moveTo(b.x + b.width / 2, b.y + b.height / 2);
      await wait(150); await page.mouse.down(); await wait(70); await page.mouse.up(); await wait(600);
    }
  };

  await S("ease", "Ease the motion", [
    async () => { rec.zoomOut(); const b = page.getByText("Expand rows"); if (await b.count()) await rec.click(b.first()); },
    async () => { await selectTurnKey("last"); await rec.zoom('[data-testid="an-easing"]', 1.6).catch(() => {}); },
    async () => { const sel = page.locator('[data-testid="an-easing"]'); await rec.fakeClick(sel); await sel.selectOption("ease"); await wait(500); },
    async () => { rec.zoomOut(); await scrub(1.7); await pose("rotation", -50); },
    async () => { await scrub(2.4); await pose("rotation", 0); },
  ]);

  await S("play", "Play it back", [
    async () => { await scrub(0); await rec.click('[data-testid="an-play"]'); await wait(3600); },
    async () => { await rec.click('[data-testid="an-play"]'); await scrub(0.7); },
    async () => { await scrub(1.7); },
  ]);

  await S("apply", "Apply to edit", [
    async () => { await rec.zoom('[data-testid="an-apply"]', 1.6); await rec.click('[data-testid="an-apply"]'); await wait(1500); rec.zoomOut(); await rec.click('[data-testid="an-close"]'); await page.waitForSelector('[data-testid="an-apply"]', { state: "detached" }); },
    async () => { await rec.click('[data-testid="workspace-animate"]'); },
    async () => { await rec.click(".timeline-panel .clip >> nth=3").catch(() => {}); await rec.zoom(".timeline-panel", 1.3); },
    async () => { await rec.hover(".preview-stage, .preview-wrap, .preview", { dy: 0.5 }); await rec.click('[data-testid="button-play"]'); await wait(1800); await rec.click('[data-testid="button-play"]'); rec.zoomOut(); },
  ]);

  await S("outro", "Summary", [
    async () => { await rec.click('[data-testid="workspace-edit"]'); },
    async () => { await rec.hover(".dock", { dy: 0.5 }); },
  ]);
}
