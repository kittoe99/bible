export const BOOKS = [
  ["GEN", "Genesis", 50],
  ["EXO", "Exodus", 40],
  ["LEV", "Leviticus", 27],
  ["NUM", "Numbers", 36],
  ["DEU", "Deuteronomy", 34],
  ["JOS", "Joshua", 24],
  ["JDG", "Judges", 21],
  ["RUT", "Ruth", 4],
  ["1SA", "1 Samuel", 31],
  ["2SA", "2 Samuel", 24],
  ["1KI", "1 Kings", 22],
  ["2KI", "2 Kings", 25],
  ["1CH", "1 Chronicles", 29],
  ["2CH", "2 Chronicles", 36],
  ["EZR", "Ezra", 10],
  ["NEH", "Nehemiah", 13],
  ["EST", "Esther", 10],
  ["JOB", "Job", 42],
  ["PSA", "Psalms", 150],
  ["PRO", "Proverbs", 31],
  ["ECC", "Ecclesiastes", 12],
  ["SNG", "Song of Solomon", 8],
  ["ISA", "Isaiah", 66],
  ["JER", "Jeremiah", 52],
  ["LAM", "Lamentations", 5],
  ["EZK", "Ezekiel", 48],
  ["DAN", "Daniel", 12],
  ["HOS", "Hosea", 14],
  ["JOL", "Joel", 3],
  ["AMO", "Amos", 9],
  ["OBA", "Obadiah", 1],
  ["JON", "Jonah", 4],
  ["MIC", "Micah", 7],
  ["NAM", "Nahum", 3],
  ["HAB", "Habakkuk", 3],
  ["ZEP", "Zephaniah", 3],
  ["HAG", "Haggai", 2],
  ["ZEC", "Zechariah", 14],
  ["MAL", "Malachi", 4],
  ["MAT", "Matthew", 28],
  ["MRK", "Mark", 16],
  ["LUK", "Luke", 24],
  ["JHN", "John", 21],
  ["ACT", "Acts", 28],
  ["ROM", "Romans", 16],
  ["1CO", "1 Corinthians", 16],
  ["2CO", "2 Corinthians", 13],
  ["GAL", "Galatians", 6],
  ["EPH", "Ephesians", 6],
  ["PHP", "Philippians", 4],
  ["COL", "Colossians", 4],
  ["1TH", "1 Thessalonians", 5],
  ["2TH", "2 Thessalonians", 3],
  ["1TI", "1 Timothy", 6],
  ["2TI", "2 Timothy", 4],
  ["TIT", "Titus", 3],
  ["PHM", "Philemon", 1],
  ["HEB", "Hebrews", 13],
  ["JAS", "James", 5],
  ["1PE", "1 Peter", 5],
  ["2PE", "2 Peter", 3],
  ["1JN", "1 John", 5],
  ["2JN", "2 John", 1],
  ["3JN", "3 John", 1],
  ["JUD", "Jude", 1],
  ["REV", "Revelation", 22],
] as const;
export type Translation = "KJV" | "WEB" | "ASV";
export type StudyTranslation = Translation | "NIV" | "ESV";
export const TRANSLATIONS: Record<Translation, string> = {
  KJV: "King James Version",
  WEB: "World English Bible",
  ASV: "American Standard Version",
};
export type Position = {
  book: string;
  chapter: number;
  translation: Translation;
  fontSize: number;
};
export const DEFAULT_POSITION: Position = {
  book: "GEN",
  chapter: 1,
  translation: "KJV",
  fontSize: 21,
};
export type Verse = { number: number; text: string };
export type Chapter = {
  verses: Verse[];
  copyright: string;
};
export type Color = "sage" | "gold" | "rose" | "blue";
export const COLORS: Color[] = ["sage", "gold", "rose", "blue"];
export type StudyItem = {
  id: string;
  user_id: string;
  kind: "note" | "bookmark" | "highlight";
  book: string;
  chapter: number;
  verses: number[];
  translation: StudyTranslation;
  body: string;
  color: Color | null;
  version: number;
  updated_at: string;
};
export function bookName(id: string) {
  return BOOKS.find((b) => b[0] === id)?.[1] ?? id;
}
export function validPosition(value: unknown): value is Position {
  if (!value || typeof value !== "object") return false;
  const p = value as Position;
  const book = BOOKS.find((b) => b[0] === p.book);
  return (
    !!book &&
    Number.isInteger(p.chapter) &&
    p.chapter >= 1 &&
    p.chapter <= book[2] &&
    Object.hasOwn(TRANSLATIONS, p.translation) &&
    Number.isInteger(p.fontSize) &&
    p.fontSize >= 16 &&
    p.fontSize <= 30
  );
}
export function availableTranslation(value: StudyTranslation): Translation {
  return value === "NIV" || value === "ESV" ? "KJV" : value;
}
export function restorePosition(value: unknown): Position | null {
  if (!value || typeof value !== "object") return null;
  const candidate = { ...value } as Position;
  candidate.translation = availableTranslation(candidate.translation);
  return validPosition(candidate) ? candidate : null;
}
export function adjacentChapter(
  book: string,
  chapter: number,
  direction: 1 | -1,
) {
  const index = BOOKS.findIndex((b) => b[0] === book);
  const next = chapter + direction;
  if (next >= 1 && next <= BOOKS[index][2]) return { book, chapter: next };
  const target = BOOKS[index + direction];
  return target
    ? { book: target[0], chapter: direction === 1 ? 1 : target[2] }
    : null;
}
export function verseLabel(verses: number[]) {
  const sorted = [...new Set(verses)].sort((a, b) => a - b);
  const ranges: string[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const start = sorted[i];
    let end = start;
    while (sorted[i + 1] === end + 1) end = sorted[++i];
    ranges.push(start === end ? `${start}` : `${start}–${end}`);
  }
  return ranges.join(", ");
}
export function reference(
  item: Pick<StudyItem, "book" | "chapter" | "verses">,
) {
  return `${bookName(item.book)} ${item.chapter}${item.verses.length ? ":" + verseLabel(item.verses) : ""}`;
}
export function parseReference(input: string) {
  const match = input
    .trim()
    .match(/^(.+?)\s*(\d+)(?::(\d+)(?:\s*[-–]\s*(\d+))?)?$/);
  if (!match) return null;
  const query = match[1].trim().toLowerCase().replace(/\./g, "");
  const aliases: Record<string, string> = {
    psalm: "PSA",
    ps: "PSA",
    jn: "JHN",
    john: "JHN",
    song: "SNG",
    "song of songs": "SNG",
    mt: "MAT",
    mk: "MRK",
    lk: "LUK",
  };
  const book =
    BOOKS.find(
      (b) =>
        b[1].toLowerCase() === query ||
        b[0].toLowerCase() === query ||
        b[0] === aliases[query],
    ) ??
    (query.length >= 3
      ? BOOKS.find((b) => b[1].toLowerCase().startsWith(query))
      : undefined);
  const chapter = Number(match[2]),
    start = Number(match[3] || 0),
    end = Number(match[4] || start);
  if (
    !book ||
    chapter < 1 ||
    chapter > book[2] ||
    start < 0 ||
    end < start ||
    end > 176 ||
    (match[3] && start === 0)
  )
    return null;
  return {
    book: book[0],
    chapter,
    verses: start
      ? Array.from({ length: end - start + 1 }, (_, i) => start + i)
      : [],
  };
}
