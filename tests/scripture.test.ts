import { readFile } from "node:fs/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BOOKS,
  DEFAULT_POSITION,
  TRANSLATIONS,
  restorePosition,
  type Chapter,
} from "../src/lib/bible";
import { loadChapter } from "../src/lib/scripture";

afterEach(() => vi.unstubAllGlobals());
const chapter = async (
  translation: string,
  book: string,
  number: number,
): Promise<Chapter> =>
  JSON.parse(
    await readFile(
      `public/bibles/v1/${translation}/${book}/${number}.json`,
      "utf8",
    ),
  );

describe("bundled Scripture", () => {
  it("contains all 1189 chapters of each edition with unique, ordered, nonempty verses", async () => {
    for (const translation of Object.keys(TRANSLATIONS)) {
      let count = 0;
      for (const [book, , chapters] of BOOKS) {
        for (let n = 1; n <= chapters; n++) {
          const data = await chapter(translation, book, n);
          expect(data.verses.length).toBeGreaterThan(0);
          expect(data.copyright).toContain("eBible.org");
          let previous = 0;
          for (const verse of data.verses) {
            expect(verse.number).toBeGreaterThan(previous);
            expect(verse.number).toBeLessThanOrEqual(176);
            expect(verse.text.trim().length).toBeGreaterThan(0);
            expect(verse.text).not.toContain("\ufffd");
            previous = verse.number;
          }
          count++;
        }
      }
      expect(count).toBe(1189);
    }
  }, 30000);
  it("contains recognizable source verses and retains numbering gaps", async () => {
    expect((await chapter("KJV", "GEN", 1)).verses[0].text).toBe(
      "In the beginning God created the heaven and the earth.",
    );
    expect((await chapter("WEB", "GEN", 1)).verses[0].text).toBe(
      "In the beginning, God created the heavens and the earth.",
    );
    expect((await chapter("ASV", "GEN", 1)).verses[0].text).toBe(
      "In the beginning God created the heavens and the earth.",
    );
    expect((await chapter("KJV", "REV", 22)).verses.at(-1)?.number).toBe(21);
    expect(
      (await chapter("ASV", "JHN", 5)).verses.map((v) => v.number),
    ).not.toContain(4);
    expect(
      (await chapter("WEB", "ACT", 8)).verses.map((v) => v.number),
    ).not.toContain(37);
  });
  it("migrates a licensed reading preference without losing the passage", () => {
    expect(
      restorePosition({
        ...DEFAULT_POSITION,
        book: "JHN",
        chapter: 3,
        translation: "NIV",
      }),
    ).toEqual({ ...DEFAULT_POSITION, book: "JHN", chapter: 3 });
    expect(
      restorePosition({ ...DEFAULT_POSITION, translation: "nonsense" }),
    ).toBeNull();
  });
});

describe("static chapter loading", () => {
  it("fetches only the app's local chapter asset, without keys or external requests", async () => {
    const data = await chapter("KJV", "GEN", 1);
    const fetchMock = vi.fn().mockResolvedValue(Response.json(data));
    vi.stubGlobal("fetch", fetchMock);
    const signal = new AbortController().signal;
    expect(await loadChapter(DEFAULT_POSITION, signal)).toEqual(data);
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      "/bibles/v1/KJV/GEN/1.json",
      { signal },
    );
  });
  it("rejects invalid passages before fetching", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      loadChapter({ ...DEFAULT_POSITION, book: "../secrets" }),
    ).rejects.toThrow("valid book");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("reports missing files, network failures, and malformed content", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 404 }));
    await expect(loadChapter(DEFAULT_POSITION)).rejects.toThrow(
      "could not be loaded",
    );
    fetchMock.mockRejectedValueOnce(new Error("Network unavailable"));
    await expect(loadChapter(DEFAULT_POSITION)).rejects.toThrow(
      "Network unavailable",
    );
    fetchMock.mockResolvedValueOnce(Response.json({ verses: [] }));
    await expect(loadChapter(DEFAULT_POSITION)).rejects.toThrow("unreadable");
  });
});
