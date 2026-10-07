import { describe, it, expect } from "vitest";
import {
  BOOKS,
  DEFAULT_POSITION,
  adjacentChapter,
  parseReference,
  validPosition,
  verseLabel,
} from "../src/lib/bible";
describe("canonical navigation", () => {
  it("covers all 66 books and every chapter without losing boundaries", () => {
    expect(BOOKS).toHaveLength(66);
    expect(BOOKS.reduce((sum, b) => sum + b[2], 0)).toBe(1189);
    let current: { book: string; chapter: number } | null = {
      book: "GEN",
      chapter: 1,
    };
    let count = 0;
    while (current) {
      const next = adjacentChapter(current.book, current.chapter, 1);
      if (next)
        expect(adjacentChapter(next.book, next.chapter, -1)).toEqual(current);
      current = next;
      count++;
    }
    expect(count).toBe(1189);
    expect(adjacentChapter("GEN", 1, -1)).toBeNull();
  });
  it("parses numbered books, aliases, and verse ranges", () => {
    expect(parseReference("1 John 3:16–18")).toEqual({
      book: "1JN",
      chapter: 3,
      verses: [16, 17, 18],
    });
    expect(parseReference("Psalm 23")).toEqual({
      book: "PSA",
      chapter: 23,
      verses: [],
    });
    expect(parseReference("jn 3:16")).toEqual({
      book: "JHN",
      chapter: 3,
      verses: [16],
    });
    expect(parseReference("Song of Songs 2:3")).toEqual({
      book: "SNG",
      chapter: 2,
      verses: [3],
    });
  });
  it.each([
    "Genesis 51",
    "Genesis 0",
    "John 3:0",
    "John 3:8-2",
    "John 3:177",
    "No book 3",
    "Revelation 23",
  ])("rejects invalid reference %s", (input) =>
    expect(parseReference(input)).toBeNull(),
  );
  it("validates restored preferences", () => {
    expect(validPosition(DEFAULT_POSITION)).toBe(true);
    expect(
      validPosition({ ...DEFAULT_POSITION, translation: "toString" }),
    ).toBe(false);
    expect(validPosition({ ...DEFAULT_POSITION, fontSize: 80 })).toBe(false);
    expect(validPosition(null)).toBe(false);
  });
  it("labels disjoint selections without falsely expanding them", () =>
    expect(verseLabel([8, 3, 1, 2, 8, 6])).toBe("1–3, 6, 8"));
});
