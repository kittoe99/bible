import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import type { StudyItem } from "../../src/lib/bible";
import AxeBuilder from "@axe-core/playwright";
const uid = "00000000-0000-4000-8000-000000000001";
const user = {
  id: uid,
  aud: "authenticated",
  role: "authenticated",
  email: "reader@example.com",
  email_confirmed_at: new Date().toISOString(),
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: {},
  created_at: new Date().toISOString(),
};
const encoded = (value: unknown) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");
const token = `${encoded({ alg: "HS256", typ: "JWT" })}.${encoded({ sub: uid, aud: "authenticated", role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 })}.fixture-signature`;
type Cloud = {
  items: StudyItem[];
  pref: Record<string, unknown> | null;
  failSave: boolean;
};
async function installMocks(context: BrowserContext, cloud: Cloud) {
  await context.route("**/bibles/v1/*/*/*.json", async (route) => {
    const translation = new URL(route.request().url()).pathname.split("/")[3];
    const numbers =
      translation === "WEB" ? [1, 3, 4, 5, 6] : [1, 2, 3, 4, 5, 6];
    await route.fulfill({
      json: {
        verses: numbers.map((number) => ({
          number,
          text: `Synthetic test verse ${number}. This fixture verifies reading and annotation behavior without distributing licensed Scripture.`,
        })),
        copyright: "Synthetic test fixture — not Scripture.",
      },
    });
  });
  await context.route(
    "https://stillword-test.supabase.co/**",
    async (route) => {
      const request = route.request(),
        url = new URL(request.url()),
        method = request.method();
      const data =
        method === "POST" || method === "PATCH" ? request.postDataJSON() : null;
      const headers = {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "*",
        "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS",
        "content-type": "application/json",
      };
      const reply = (json: unknown, status = 200) =>
        route.fulfill({ json, status, headers });
      if (method === "OPTIONS") return route.fulfill({ status: 204, headers });
      if (url.pathname === "/auth/v1/token")
        return reply({
          access_token: token,
          token_type: "bearer",
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          refresh_token: "fixture-refresh",
          user,
        });
      if (url.pathname === "/auth/v1/user") return reply(user);
      if (
        url.pathname === "/auth/v1/logout" ||
        url.pathname === "/auth/v1/recover"
      )
        return reply({});
      if (url.pathname === "/auth/v1/signup")
        return reply({ user, session: null });
      if (url.pathname === "/rest/v1/reading_preferences") {
        if (method === "POST") {
          cloud.pref = Array.isArray(data) ? data[0] : data;
          return reply(null);
        }
        return reply(cloud.pref ? [cloud.pref] : []);
      }
      if (url.pathname === "/rest/v1/study_items") {
        const id = url.searchParams.get("id")?.replace("eq.", "");
        const match = cloud.items.filter((i) => !id || i.id === id);
        if (method === "DELETE") {
          cloud.items = cloud.items.filter((i) => !match.includes(i));
          return reply(match.map((i) => ({ id: i.id })));
        }
        if (request.headers()["accept"]?.includes("vnd.pgrst.object+json"))
          return reply(match[0] ?? null);
        return reply(match);
      }
      if (url.pathname === "/rest/v1/rpc/save_note") {
        if (cloud.failSave)
          return reply({ message: "Simulated network failure" }, 503);
        const existing = cloud.items.find((i) => i.id === data.p_id);
        if (
          existing ? existing.version !== data.p_version : data.p_version !== 0
        )
          return reply({ code: "40001", message: "NOTE_CONFLICT" }, 409);
        const item: StudyItem = {
          id: data.p_id,
          user_id: uid,
          kind: "note",
          book: data.p_book,
          chapter: data.p_chapter,
          verses: data.p_verses,
          translation: data.p_translation,
          body: data.p_body,
          color: null,
          version: (existing?.version ?? 0) + 1,
          updated_at: new Date().toISOString(),
        };
        cloud.items = [item, ...cloud.items.filter((i) => i.id !== item.id)];
        return reply(item);
      }
      if (url.pathname === "/rest/v1/rpc/set_annotations") {
        for (const verse of data.p_verses) {
          cloud.items = cloud.items.filter(
            (i) =>
              !(
                i.kind === data.p_kind &&
                i.book === data.p_book &&
                i.chapter === data.p_chapter &&
                i.verses.includes(verse)
              ),
          );
          if (!data.p_remove)
            cloud.items.push({
              id: crypto.randomUUID(),
              user_id: uid,
              kind: data.p_kind,
              book: data.p_book,
              chapter: data.p_chapter,
              verses: [verse],
              translation: data.p_translation,
              body: "",
              color: data.p_color,
              version: 1,
              updated_at: new Date().toISOString(),
            });
        }
        return reply(null);
      }
      return reply({ message: `Unmocked ${method} ${url.pathname}` }, 404);
    },
  );
}
async function signIn(page: Page) {
  await expect(page.getByRole("dialog")).toBeHidden();
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Email address").fill("reader@example.com");
  await dialog.getByLabel("Password", { exact: true }).fill("example-password");
  await dialog
    .getByRole("button", { name: "Sign in", exact: true })
    .last()
    .click();
  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Account", exact: true }),
  ).toBeVisible();
}
const cloudState = (): Cloud => ({ items: [], pref: null, failSave: false });

test("styled pickers support search, keyboard navigation, focus restoration, and mobile chapters", async ({
  page,
  context,
}) => {
  await installMocks(context, cloudState());
  await page.goto("/");
  await page
    .getByRole("button", { name: "Book: Genesis", exact: true })
    .click();
  await expect(page.getByRole("option")).toHaveCount(66);
  await expect(
    page.getByRole("textbox", { name: "Search books" }),
  ).toBeFocused();
  await page.getByRole("textbox", { name: "Search books" }).fill("not a book");
  await expect(
    page.getByText("No books found.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("textbox", { name: "Search books" }).fill("sam");
  await expect(page.getByRole("option")).toHaveCount(2);
  await page.getByRole("dialog").evaluate(async (dialog) => {
    await Promise.all(
      dialog.getAnimations().map((animation) => animation.finished),
    );
  });
  const scan = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(scan.violations).toEqual([]);
  await page.screenshot({
    path: "test-results/book-picker-desktop.png",
    animations: "disabled",
  });
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expect(
    page.getByRole("option", { name: "2 Samuel", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("button", { name: "Book: 2 Samuel", exact: true }),
  ).toBeFocused();
  await expect(
    page.getByRole("heading", { name: "2 Samuel 1", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Translation: KJV", exact: true })
    .click();
  await expect(page.getByRole("option", { name: /^KJV —/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.mouse.click(8, 8);
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Translation: KJV", exact: true }),
  ).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Book: 2 Samuel", exact: true })
    .click();
  await page.getByRole("textbox", { name: "Search books" }).fill("Psalms");
  await page.getByRole("option", { name: "Psalms", exact: true }).click();
  await page.getByRole("button", { name: "Chapter: 1", exact: true }).click();
  await expect(page.getByRole("option")).toHaveCount(150);
  await expect(
    page.getByRole("option", { name: "1", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(
    page.getByRole("option", { name: "6", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("End");
  await expect(
    page.getByRole("option", { name: "150", exact: true }),
  ).toBeFocused();
  await page.screenshot({
    path: "test-results/chapter-picker-mobile.png",
    animations: "disabled",
  });
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 390);
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Psalms 150", exact: true }),
  ).toBeVisible();
});

test("bundled Scripture works without provider access across screen sizes", async ({
  page,
  context,
}) => {
  const external: string[] = [];
  page.on("request", (request) => {
    if (!request.url().startsWith("http://127.0.0.1:3100"))
      external.push(request.url());
  });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1:3100)/, (route) =>
    route.abort(),
  );
  await page.goto("/");
  await expect(page.locator("#verse-1")).toContainText(
    "In the beginning God created the heaven and the earth.",
  );
  await expect(page.locator(".verse")).toHaveCount(31);
  for (const width of [320, 390, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.locator("body")).toHaveJSProperty("scrollWidth", width);
    const navigation = page.getByRole("complementary", {
      name: "Main navigation",
    });
    if (width >= 1024) {
      await expect(navigation).toBeVisible();
      await expect(navigation).not.toHaveAttribute("inert");
      await expect(
        page.getByRole("navigation", { name: "App navigation" }),
      ).toBeHidden();
    } else {
      await expect(navigation).toBeHidden();
      await expect(
        page.getByRole("navigation", { name: "App navigation" }),
      ).toBeVisible();
    }
    await page.screenshot({
      path: `test-results/bible-${width}.png`,
      animations: "disabled",
    });
  }
  await page
    .getByRole("button", { name: "Translation: KJV", exact: true })
    .click();
  await page.getByRole("option", { name: /^WEB —/ }).click();
  await expect(page.locator("#verse-1")).toContainText(
    "In the beginning, God created the heavens and the earth.",
  );
  await page
    .getByRole("button", { name: "Translation: WEB", exact: true })
    .click();
  await page.getByRole("option", { name: /^ASV —/ }).click();
  await page.getByLabel("Go to a Bible reference").fill("John 5:3-5");
  await page.getByRole("button", { name: "Find passage" }).click();
  await expect(page.locator("#verse-4")).toHaveCount(0);
  await expect(page.locator("#verse-5")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Translation: ASV", exact: true }),
  ).toBeVisible();
  await expect(page.locator("#verse-5")).toBeVisible();
  expect(external).toEqual([]);
  await page.getByLabel("Go to a Bible reference").fill("Genesis 1");
  await page.getByRole("button", { name: "Find passage" }).click();
  await expect(page.locator("#verse-1")).toBeVisible();
  await page.getByRole("button", { name: "Toggle notes panel" }).click();
  const reader = await page.locator(".reader-card").boundingBox();
  const notes = await page
    .getByRole("complementary", { name: "Notes and reflections" })
    .boundingBox();
  expect(notes!.x).toBeGreaterThanOrEqual(reader!.x + reader!.width);
  await page.screenshot({
    path: "test-results/bible-desktop-notes.png",
    animations: "disabled",
  });
  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(accessibility.violations).toEqual([]);
});

test("a local chapter failure can be retried", async ({ page }) => {
  await page.route("**/bibles/v1/KJV/GEN/1.json", (route) =>
    route.fulfill({ status: 503 }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Scripture unavailable" }),
  ).toBeVisible();
  await page.unroute("**/bibles/v1/KJV/GEN/1.json");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.locator("#verse-1")).toContainText(
    "In the beginning God created",
  );
});

test("reading navigation, missing verses, restoration, and mobile layout", async ({
  page,
  context,
}) => {
  await installMocks(context, cloudState());
  await page.goto("/");
  await expect(page.locator("#verse-1")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Genesis 1", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "App navigation" }),
  ).toBeHidden();
  await expect(
    page.getByRole("complementary", { name: "Notes and reflections" }),
  ).toBeHidden();
  await expect(
    page.getByText("Meet Him in the Word.", { exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("Go to a Bible reference").fill("John 3:1-3");
  await page.getByRole("button", { name: "Find passage" }).click();
  await expect(page.locator("#verse-3")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page
    .getByRole("button", { name: "Translation: KJV", exact: true })
    .click();
  await page.getByRole("option", { name: /^WEB —/ }).click();
  await expect(page.locator("#verse-2")).toHaveCount(0);
  await expect(page.locator("#verse-3")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("status")).toContainText("Some selected verses");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Book: John", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Chapter: 3", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Translation: WEB", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Next chapter", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Chapter: 4", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reading settings" }).click();
  await page.getByLabel("Scripture text size").fill("26");
  await page.getByRole("button", { name: "Close dialog" }).click();
  await expect(page.locator(".scripture")).toHaveCSS("font-size", "26px");
  await page.screenshot({
    path: "test-results/reader-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("button", { name: "Open navigation" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page
    .getByRole("button", { name: "New Testament", exact: true })
    .click();
  await page
    .getByRole("navigation", { name: "Bible books" })
    .getByRole("button", { name: "Revelation" })
    .click();
  await expect(
    page.getByRole("button", { name: "Book: Revelation", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Chapter: 1", exact: true }).click();
  await expect(page.getByRole("option")).toHaveCount(22);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 390);
  await page.screenshot({
    path: "test-results/reader-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
});
test("signed-out annotation actions require an account", async ({
  page,
  context,
}) => {
  await installMocks(context, cloudState());
  await page.goto("/");
  await page.locator("#verse-1").click();
  await page.getByRole("button", { name: "Highlight sage" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.locator("#verse-1")).not.toHaveClass(/highlight-sage/);
});
test("highlights, bookmarks, multi-verse notes, reload, and another signed-in device", async ({
  page,
  context,
  browser,
}) => {
  const cloud = cloudState();
  await installMocks(context, cloud);
  await page.goto("/");
  await signIn(page);
  await page.locator("#verse-1").click();
  await page.locator("#verse-3").click({ modifiers: ["Shift"] });
  await page.getByRole("button", { name: "Highlight sage" }).click();
  await expect(page.locator("#verse-2")).toHaveClass(/highlight-sage/);
  await page.getByRole("button", { name: "Bookmark", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Unmark", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add note", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Your note" })
    .fill("A reflection shared across my devices.");
  await expect(
    page.getByText("Saved to your account", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /My saved library/ }).click();
  await page
    .getByRole("button", { name: "Read the Bible", exact: true })
    .click();
  await page.getByRole("button", { name: "Toggle notes panel" }).click();
  await expect(page.getByRole("textbox", { name: "Your note" })).toHaveValue(
    "A reflection shared across my devices.",
  );
  await page.reload();
  await expect(page.locator("#verse-1")).toHaveClass(/highlight-sage/);
  await page.getByRole("button", { name: /My saved library/ }).click();
  await page.getByRole("button", { name: "Notes", exact: true }).click();
  await expect(
    page.getByText("A reflection shared across my devices."),
  ).toBeVisible();
  const second = await browser.newContext();
  await installMocks(second, cloud);
  const other = await second.newPage();
  await other.goto("/");
  await signIn(other);
  await other.getByRole("button", { name: /My saved library/ }).click();
  await other.getByRole("button", { name: "Notes", exact: true }).click();
  await expect(
    other.getByText("A reflection shared across my devices."),
  ).toBeVisible();
  await second.close();
  await page
    .getByRole("button", { name: "Edit note on Genesis 1:1–3" })
    .click();
  await page
    .getByRole("textbox", { name: "Your note" })
    .fill("Edited reflection");
  await expect(
    page.getByText("Saved to your account", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /My saved library/ }).click();
  await page
    .getByRole("button", { name: "Delete note on Genesis 1:1–3" })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete note", exact: true })
    .click();
  await expect(
    page.getByText("Edited reflection", { exact: true }),
  ).toHaveCount(0);
  await expect
    .poll(() => cloud.items.filter((i) => i.kind === "note").length)
    .toBe(0);
});
test("failed saves recover local drafts and conflicting edits can be saved as a copy", async ({
  page,
  context,
}) => {
  const cloud = cloudState();
  await installMocks(context, cloud);
  await page.goto("/");
  await signIn(page);
  await page.locator("#verse-1").click();
  await page.getByRole("button", { name: "Add note", exact: true }).click();
  cloud.failSave = true;
  await page
    .getByRole("textbox", { name: "Your note" })
    .fill("An interrupted draft");
  await expect(
    page.getByText("Not synced. Draft kept on this device."),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: /My saved library/ }).click();
  await expect(page.getByText("UNSYNCED DRAFT")).toBeVisible();
  cloud.failSave = false;
  await page.getByRole("button", { name: "Edit note on Genesis 1:1" }).click();
  await expect(
    page.getByText("Saved to your account", { exact: true }),
  ).toBeVisible();
  cloud.items[0].version++;
  cloud.items[0].body = "Edited elsewhere";
  await page
    .getByRole("textbox", { name: "Your note" })
    .fill("My conflicting draft");
  await expect(page.getByText("Changed on another device")).toBeVisible();
  await page.getByRole("button", { name: "Save draft as a copy" }).click();
  await expect(
    page.getByText("Saved to your account", { exact: true }),
  ).toBeVisible();
  expect(cloud.items.filter((i) => i.kind === "note")).toHaveLength(2);
  expect(cloud.items.some((i) => i.body === "Edited elsewhere")).toBe(true);
});
test("registration, password reset, password update, and sign out", async ({
  page,
  context,
}) => {
  await installMocks(context, cloudState());
  await page.goto("/");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await dialog.getByLabel("Email address").fill("reader@example.com");
  await dialog.getByLabel("Password", { exact: true }).fill("example-password");
  await dialog
    .getByRole("button", { name: "Create your account", exact: true })
    .click();
  await expect(dialog.getByRole("status")).toContainText("Check your email");
  await dialog
    .getByRole("button", { name: "Sign in", exact: true })
    .first()
    .click();
  await dialog.getByRole("button", { name: "Forgot your password?" }).click();
  await dialog.getByRole("button", { name: "Send reset link" }).click();
  await expect(dialog.getByRole("status")).toContainText("password reset link");
  await dialog.getByRole("button", { name: "Close dialog" }).click();
  await signIn(page);
  await page.goto("/?recovery=1");
  await expect(
    page.getByRole("heading", { name: "Choose a new password" }),
  ).toBeVisible();
  await page.getByLabel("Password", { exact: true }).fill("changed-password");
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await page.getByRole("button", { name: "Reading settings" }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeVisible();
});
test("reader and account dialog pass accessibility checks and keyboard selection", async ({
  page,
  context,
}) => {
  await installMocks(context, cloudState());
  await page.goto("/");
  await expect(page.locator("#verse-1")).toBeVisible();
  await page.locator("#verse-1").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#verse-1")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const reader = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(
    reader.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => ({
        target: n.target,
        summary: n.failureSummary,
      })),
    })),
  ).toEqual([]);
  await page.getByRole("button", { name: "Add note", exact: true }).click();
  await page.getByRole("dialog").evaluate(async (dialog) => {
    await Promise.all(
      dialog.getAnimations().map((animation) => animation.finished),
    );
  });
  const dialog = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(
    dialog.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => ({
        target: n.target,
        summary: n.failureSummary,
      })),
    })),
  ).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "Next chapter", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Genesis 2", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".chapter-heading")).toHaveCSS(
    "animation-name",
    "none",
  );
  await expect(page.locator(".nav-indicator")).toHaveCSS(
    "transition-duration",
    "0s",
  );
  await page.getByRole("button", { name: "Reading settings" }).click();
  await expect(page.getByRole("dialog")).toHaveCSS("animation-name", "none");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
});
