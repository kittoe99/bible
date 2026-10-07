import { BOOKS, TRANSLATIONS, type Chapter, type Position } from "./bible";

/** Static files shipped with the app. No Scripture API or credentials. */
export async function loadChapter(
  position: Pick<Position, "book" | "chapter" | "translation">,
  signal?: AbortSignal,
): Promise<Chapter> {
  const book = BOOKS.find((item) => item[0] === position.book);
  if (
    !book ||
    !Number.isInteger(position.chapter) ||
    position.chapter < 1 ||
    position.chapter > book[2] ||
    !Object.hasOwn(TRANSLATIONS, position.translation)
  )
    throw new Error("Choose a valid book, chapter, and translation.");
  const response = await fetch(
    `/bibles/v1/${position.translation}/${position.book}/${position.chapter}.json`,
    { signal },
  );
  if (!response.ok)
    throw new Error("This chapter could not be loaded. Please try again.");
  const data = (await response.json()) as Chapter;
  if (
    !Array.isArray(data.verses) ||
    !data.verses.length ||
    data.verses.some(
      (verse) =>
        !Number.isInteger(verse.number) ||
        verse.number < 1 ||
        verse.number > 176 ||
        typeof verse.text !== "string" ||
        !verse.text.trim(),
    ) ||
    new Set(data.verses.map((verse) => verse.number)).size !==
      data.verses.length ||
    typeof data.copyright !== "string"
  ) {
    throw new Error("This chapter's data is unreadable. Please try again.");
  }
  return data;
}
