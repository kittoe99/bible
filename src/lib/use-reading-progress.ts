"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

export const chapterKey = (book: string, chapter: number) =>
  `${book}.${chapter}`;
type Snapshot = { owner: string; completed: Set<string> };

export function useReadingProgress(
  client: SupabaseClient | null,
  userId?: string,
) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const epoch = useRef(0);
  const request = useRef(0);
  const writing = useRef(false);

  const refresh = useCallback(async () => {
    if (!client || !userId || writing.current) return;
    const generation = epoch.current;
    const ticket = ++request.current;
    const completed = new Set<string>();
    try {
      // A complete Bible exceeds the default 1,000-row API limit.
      for (let offset = 0; ; offset += 500) {
        const { data, error } = await client
          .from("chapter_progress")
          .select("book,chapter")
          .eq("user_id", userId)
          .order("book")
          .order("chapter")
          .range(offset, offset + 499);
        if (generation !== epoch.current || ticket !== request.current) return;
        if (error) throw error;
        data.forEach((row) => completed.add(chapterKey(row.book, row.chapter)));
        if (data.length < 500) break;
      }
      setSnapshot({ owner: userId, completed });
      setError("");
    } catch {
      if (generation === epoch.current && ticket === request.current)
        setError("Progress could not sync. Check your connection and retry.");
    }
  }, [client, userId]);

  useEffect(() => {
    const generation = ++epoch.current;
    writing.current = false;
    // Schedule initial refresh so auth changes discard all pending responses.
    const timer = setTimeout(() => {
      setSnapshot(null);
      setError("");
      setBusy(false);
      void refresh();
    }, 0);
    const resume = () => void refresh();
    window.addEventListener("focus", resume);
    window.addEventListener("online", resume);
    return () => {
      epoch.current = generation + 1;
      clearTimeout(timer);
      window.removeEventListener("focus", resume);
      window.removeEventListener("online", resume);
    };
  }, [refresh]);

  async function toggle(book: string, chapter: number) {
    if (
      !client ||
      !userId ||
      snapshot?.owner !== userId ||
      writing.current ||
      error
    )
      return;
    const generation = epoch.current;
    ++request.current; // Invalidate a focus refresh started before this write.
    writing.current = true;
    setBusy(true);
    setError("");
    const key = chapterKey(book, chapter);
    const remove = snapshot.completed.has(key);
    try {
      const result = remove
        ? await client
            .from("chapter_progress")
            .delete()
            .eq("user_id", userId)
            .eq("book", book)
            .eq("chapter", chapter)
        : await client
            .from("chapter_progress")
            .upsert(
              { user_id: userId, book, chapter },
              { onConflict: "user_id,book,chapter", ignoreDuplicates: true },
            );
      if (generation !== epoch.current) return;
      if (result.error) throw result.error;
      setSnapshot((current) => {
        if (current?.owner !== userId) return current;
        const completed = new Set(current.completed);
        if (remove) completed.delete(key);
        else completed.add(key);
        return { owner: userId, completed };
      });
      writing.current = false;
      await refresh();
    } catch {
      if (generation === epoch.current)
        setError(
          "Your change could not be confirmed. Retry sync before marking this chapter again.",
        );
    } finally {
      if (generation === epoch.current) {
        writing.current = false;
        setBusy(false);
      }
    }
  }

  return {
    completed:
      snapshot && snapshot.owner === userId
        ? snapshot.completed
        : new Set<string>(),
    ready: Boolean(userId && snapshot?.owner === userId),
    error: userId ? error : "",
    busy,
    refresh,
    toggle,
  };
}
