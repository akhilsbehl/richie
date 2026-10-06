import { chromium } from "/home/akhil/configs/richie/node_modules/playwright/index.mjs";
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome" });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(process.argv[2] /* review URL from: richie review --json deck.html */);
const frame = page.frameLocator("#html-artifact");
const item = frame.locator("#fuel-whale");
await item.scrollIntoViewIfNeeded();
// Ask the browser where the first character of "Whale" and the last character of "scarce" are, in page coordinates.
const frameBox = await page.locator("#html-artifact").boundingBox();
const pts = await item.evaluate((li) => {
  const first = li.querySelector("strong").firstChild, em = li.querySelector("em").firstChild;
  const r = (n, a, b) => { const x = document.createRange(); x.setStart(n, a); x.setEnd(n, b); return x.getBoundingClientRect(); };
  const end = em.textContent.indexOf("scarce") + 6;
  const a = r(first, 0, 1), b = r(em, end - 1, end);
  return { ax: a.left + 1, ay: a.top + a.height / 2, bx: b.right - 1, by: b.top + b.height / 2 };
});
const [x1, y1, x2, y2] = [frameBox.x + pts.ax, frameBox.y + pts.ay, frameBox.x + pts.bx, frameBox.y + pts.by];
// REAL INPUT: these go through Chrome's input pipeline (CDP Input.dispatchMouseEvent), so events are isTrusted=true.
await page.mouse.move(x1, y1);
await page.mouse.down();
await page.mouse.move(x2, y2, { steps: 10 });
await page.mouse.up();
const selected = await item.evaluate(() => String(getSelection()));
await item.evaluate(() => { window.__qaTrusted = "none"; addEventListener("keydown", (e) => { window.__qaTrusted = e.isTrusted; }, { once: true, capture: true }); });
await page.keyboard.press("c");                       // real key press, delivered to the focused frame
const focusInFrame = await item.evaluate(() => ({ active: document.activeElement?.tagName, cls: document.activeElement?.className, text: document.activeElement?.textContent, inMenu: !!document.activeElement?.closest(".richie-html-ui"), hasFocus: document.hasFocus() }));
console.log("after c:", JSON.stringify({ selected, trusted: await item.evaluate(() => window.__qaTrusted), focusInFrame, dialogOpen: await page.evaluate(() => document.querySelector("#richie-dialog").open) }));
await frame.getByRole("button", { name: "Comment" }).click();          // real click on the in-frame menu
await page.getByRole("dialog").waitFor({ timeout: 4000 });
console.log("after menu click:", JSON.stringify({ title: await page.locator("#richie-dialog-title").textContent(), message: await page.locator("#richie-dialog-message").textContent() }));
await page.screenshot({ path: "/tmp/richie-drag-demo.png" });
await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
await browser.close();
