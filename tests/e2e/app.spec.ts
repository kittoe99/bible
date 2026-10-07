import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import type { StudyItem } from "../../src/lib/bible";
import { BOOKS } from "../../src/lib/bible";
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
  progress: { user_id: string; book: string; chapter: number }[];
  failProgress: boolean;
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
        url.pathname === "/auth/v1/recover" ||
        url.pathname === "/auth/v1/resend"
      )
        return reply({});
      if (url.pathname === "/auth/v1/signup")
        return reply({ user, session: null });
      if (url.pathname === "/rest/v1/chapter_progress") {
        if (cloud.failProgress)
          return reply({ message: "Simulated failure" }, 503);
        const book = url.searchParams.get("book")?.replace("eq.", "");
        const chapter = Number(
          url.searchParams.get("chapter")?.replace("eq.", ""),
        );
        if (method === "POST") {
          if (
            !cloud.progress.some(
              (row) => row.book === data.book && row.chapter === data.chapter,
            )
          )
            cloud.progress.push(data);
          return reply(null);
        }
        if (method === "DELETE") {
          cloud.progress = cloud.progress.filter(
            (row) => row.book !== book || row.chapter !== chapter,
          );
          return reply(null);
        }
        const offset = Number(url.searchParams.get("offset") ?? 0);
        const limit = Number(url.searchParams.get("limit") ?? 1000);
        return reply(cloud.progress.slice(offset, offset + limit));
      }
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
const cloudState = (): Cloud => ({
  items: [],
  pref: null,
  failSave: false,
  progress: [],
  failProgress: false,
});

test("manual chapter progress persists across translations, reloads and sessions, with undo and retry", async ({
  page,
  context,
  browser,
}) => {
  const cloud = cloudState();
  await installMocks(context, cloud);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Complete chapter", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Account", exact: true }),
  ).toBeVisible();
  expect(cloud.progress).toHaveLength(0);
  await page.getByRole("button", { name: "Close dialog" }).click();
  await signIn(page);
  const complete = page.getByRole("button", {
    name: "Complete chapter",
    exact: true,
  });
  await complete.click();
  await expect(
    page.getByRole("button", { name: "Completed — mark unread" }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(cloud.progress).toHaveLength(1);
  await page
    .getByRole("button", { name: "Translation: KJV", exact: true })
    .click();
  await page.getByRole("option", { name: /^WEB —/ }).click();
  await expect(
    page.getByRole("button", { name: "Completed — mark unread" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Completed — mark unread" }),
  ).toBeVisible();
  const otherContext = await browser.newContext();
  await installMocks(otherContext, cloud);
  const other = await otherContext.newPage();
  await other.goto("/");
  await signIn(other);
  await expect(
    other.getByRole("button", { name: "Completed — mark unread" }),
  ).toBeVisible();
  await otherContext.close();
  await page
    .getByRole("button", { name: "View progress", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Reading progress" });
  await expect(dialog.getByRole("progressbar")).toHaveAttribute("value", "1");
  await expect(
    dialog.getByRole("button", { name: "Genesis 1, completed", exact: true }),
  ).toBeVisible();
  await dialog.evaluate(async (el) => {
    await Promise.all(el.getAnimations().map((a) => a.finished));
  });
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({
    path: "test-results/progress-desktop.png",
    animations: "disabled",
  });
  await dialog
    .getByRole("button", { name: "Genesis 2, unread", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Genesis 2", exact: true }),
  ).toBeVisible();
  cloud.failProgress = true;
  await complete.click();
  await expect(
    page.locator(".chapter-completion").getByRole("alert"),
  ).toContainText("could not be confirmed");
  expect(cloud.progress).toHaveLength(1);
  cloud.failProgress = false;
  await page.getByRole("button", { name: "Retry sync", exact: true }).click();
  await complete.click();
  await expect(
    page.getByRole("button", { name: "Completed — mark unread" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Completed — mark unread" }).click();
  await expect(complete).toBeEnabled();
  expect(cloud.progress).toHaveLength(1);
  await page.setViewportSize({ width: 320, height: 740 });
  await page
    .getByRole("button", { name: "View progress", exact: true })
    .click();
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 320);
  await page.screenshot({
    path: "test-results/progress-mobile.png",
    animations: "disabled",
  });
  await dialog.getByRole("button", { name: "Close dialog" }).click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Reading settings" }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page
    .getByRole("button", { name: "View progress", exact: true })
    .click();
  await expect(dialog.getByRole("progressbar")).toHaveCount(0);
  await expect(
    dialog.getByText("Sign in to keep track", { exact: false }),
  ).toBeVisible();
});

test("progress includes all 1189 chapters and refreshes on device focus", async ({
  page,
  context,
}) => {
  const cloud = cloudState();
  cloud.progress = BOOKS.flatMap(([book, , chapters]) =>
    Array.from({ length: chapters }, (_, i) => ({
      user_id: uid,
      book,
      chapter: i + 1,
    })),
  );
  await installMocks(context, cloud);
  await page.goto("/");
  await signIn(page);
  await page
    .getByRole("button", { name: "View progress", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Reading progress" });
  await expect(dialog.getByRole("progressbar")).toHaveAttribute(
    "value",
    "1189",
  );
  await dialog.getByLabel("Search progress books").fill("Revelation");
  await dialog.getByRole("button", { name: "Revelation 22 / 22" }).click();
  await expect(
    dialog.getByRole("button", {
      name: "Revelation 22, completed",
      exact: true,
    }),
  ).toBeVisible();
  cloud.progress = cloud.progress.filter(
    (row) => row.book !== "REV" || row.chapter !== 22,
  );
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(dialog.getByRole("progressbar")).toHaveAttribute(
    "value",
    "1188",
  );
  await expect(
    dialog.getByRole("button", { name: "Revelation 22, unread", exact: true }),
  ).toBeVisible();
});

test("dedicated sign-in validates credentials, supports resend, and returns to reading", async ({
  page,
  context,
}) => {
  await installMocks(context, cloudState());
  let code = "invalid_credentials";
  await page.route("**/auth/v1/token?*", (route) =>
    route.fulfill({
      status: 400,
      json: { error_code: code, msg: "Authentication failed" },
      headers: { "access-control-allow-origin": "*" },
    }),
  );
  await page.goto("/auth/sign-in");
  await expect(
    page.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
  const scan = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(scan.violations).toEqual([]);
  await page.screenshot({
    path: "test-results/auth-desktop.png",
    animations: "disabled",
  });
  await page.getByLabel("Email address").fill("reader@example.com");
  await page.getByLabel("Password", { exact: true }).fill("example-password");
  await page
    .getByRole("button", { name: "Show password", exact: true })
    .click();
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute(
    "type",
    "text",
  );
  await page
    .getByRole("button", { name: "Hide password", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Sign in", exact: true })
    .last()
    .click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "email or password is incorrect",
  );
  code = "email_not_confirmed";
  await page
    .getByRole("button", { name: "Sign in", exact: true })
    .last()
    .click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Confirm your email",
  );
  await page.getByRole("button", { name: "Resend confirmation email" }).click();
  await expect(page.getByRole("status")).toContainText("new confirmation link");
  await expect(page.getByRole("button", { name: /Resend in/ })).toBeDisabled();
  await page.unroute("**/auth/v1/token?*");
  await page
    .getByRole("button", { name: "Sign in", exact: true })
    .last()
    .click();
  await expect(page).toHaveURL("http://127.0.0.1:3100/");
  await expect(
    page.getByRole("button", { name: "Account", exact: true }),
  ).toBeVisible();
});

test("mobile registration catches password mismatch and expired recovery allows a new link", async ({
  page,
  context,
}) => {
  await installMocks(context, cloudState());
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/auth/sign-in");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await page.getByLabel("Email address").fill("reader@example.com");
  await page.getByLabel("Password", { exact: true }).fill("example-password");
  await page
    .getByLabel("Confirm password", { exact: true })
    .fill("different-password");
  let registrations = 0;
  page.on("request", (request) => {
    if (request.url().includes("/auth/v1/signup")) registrations++;
  });
  await page.getByRole("button", { name: "Create your account" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "passwords don’t match",
  );
  expect(registrations).toBe(0);
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 320);
  await page.screenshot({
    path: "test-results/auth-mobile.png",
    animations: "disabled",
  });
  await page
    .getByLabel("Confirm password", { exact: true })
    .fill("example-password");
  await page.getByRole("button", { name: "Create your account" }).click();
  await expect(page.getByRole("status")).toContainText("Check your email");
  await page.goto("/auth/reset-password");
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "expired or is invalid",
  );
  await expect(
    page.getByRole("button", { name: "Update password" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Request a new reset link" }).click();
  await page.getByLabel("Email address").fill("reader@example.com");
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("status")).toContainText("password reset link");
});

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
      ).toBeVisible();
    } else {
      await expect(navigation).toBeHidden();
      await expect(
        page.getByRole("button", { name: "Open navigation" }),
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
  ).toBeVisible();
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
    .getByLabel("Confirm password", { exact: true })
    .fill("example-password");
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
  await page.goto("/auth/reset-password");
  await expect(
    page.getByRole("heading", { name: "Choose a new password" }),
  ).toBeVisible();
  await page.getByLabel("Password", { exact: true }).fill("changed-password");
  await page
    .getByLabel("Confirm password", { exact: true })
    .fill("changed-password");
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page).toHaveURL("http://127.0.0.1:3100/");
  await page.getByRole("button", { name: "Reading settings" }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeVisible();
});
test("mobile menu contains navigation while native Scripture selection stays disabled", async ({
  page,
  context,
}) => {
  await installMocks(context, cloudState());
  await page.goto("/");
  await signIn(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".bottom-nav")).toHaveCount(0);
  const menu = page.getByRole("navigation", { name: "App navigation" });
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(
    menu.getByRole("button", { name: "Reading settings" }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/navigation-menu-mobile.png",
    animations: "disabled",
  });
  await menu.getByRole("button", { name: "My saved library" }).click();
  await expect(menu).toBeHidden();
  await expect(page.locator(".saved-card")).toBeVisible();
  await page.getByRole("button", { name: "Open navigation" }).click();
  await menu.getByRole("button", { name: "Read the Bible" }).click();
  await expect(page.locator("#verse-1")).toBeVisible();
  await page.getByRole("button", { name: "Open navigation" }).click();
  await menu.getByRole("button", { name: "Reading settings" }).click();
  await expect(page.getByLabel("Scripture text size")).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  const verse = page.locator("#verse-1");
  await verse.dblclick();
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe("");
  await expect(verse).toHaveCSS("user-select", "none");
  await page.keyboard.press("Escape");
  await verse.click();
  await page.getByRole("button", { name: "Highlight sage" }).click();
  await expect(verse).toHaveClass(/highlight-sage/);
  await page.getByRole("button", { name: "Bookmark", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Unmark", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add note", exact: true }).click();
  const note = page.getByRole("textbox", { name: "Your note" });
  await note.fill("Notes still support selecting and editing text.");
  await note.press("ControlOrMeta+a");
  expect(
    await note.evaluate(
      (element: HTMLTextAreaElement) =>
        element.selectionEnd - element.selectionStart,
    ),
  ).toBe(47);
  await note.press("Backspace");
  await expect(note).toHaveValue("");
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
  await expect(page.locator(".bottom-nav")).toHaveCount(0);
  await page.getByRole("button", { name: "Reading settings" }).click();
  await expect(page.getByRole("dialog")).toHaveCSS("animation-name", "none");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
});
