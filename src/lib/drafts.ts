import type { StudyItem } from "./bible";
import { readLocal, writeLocal, removeLocal } from "./storage";
export function draftKey(item: Pick<StudyItem, "user_id" | "id">) {
  return `stillword:draft:${item.user_id}:${item.id}`;
}
export function saveDraft(item: StudyItem) {
  return writeLocal(draftKey(item), item);
}
export function clearDraft(item: StudyItem) {
  removeLocal(draftKey(item));
}
export function getDraft(item: StudyItem) {
  return readLocal<StudyItem>(draftKey(item));
}
export function getDrafts(userId: string): StudyItem[] {
  try {
    return Object.keys(localStorage)
      .filter((key) => key.startsWith(`stillword:draft:${userId}:`))
      .map((key) => readLocal<StudyItem>(key))
      .filter(
        (item): item is StudyItem =>
          !!item &&
          item.user_id === userId &&
          item.kind === "note" &&
          (!!item.body || item.version > 0),
      );
  } catch {
    return [];
  }
}
