import type { Page } from "playwright";
import type { Abrufer } from "./quelle.js";

/** Abrufer ueber eine Playwright-Seite (echter Browser, nur in CI). */
export function playwrightAbrufer(page: Page, nachLadenMs = 2000): Abrufer {
  return {
    async hole(url) {
      const r = await page.goto(url, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(nachLadenMs);
      return { status: r?.status() ?? 0, html: await page.content(), url: page.url() };
    },
    warte: (ms) => page.waitForTimeout(ms),
  };
}
