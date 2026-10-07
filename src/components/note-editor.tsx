"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Cloud, RotateCcw, X, AlertCircle } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { reference, type StudyItem } from "@/lib/bible";
import { clearDraft, getDraft, saveDraft } from "@/lib/drafts";
type Status = "editing" | "saving" | "saved" | "error" | "conflict";
export default function NoteEditor({
  item,
  client,
  onSaved,
  onClose,
}: {
  item: StudyItem;
  client: SupabaseClient;
  onSaved: (item: StudyItem) => void;
  onClose: () => void;
}) {
  const [recovered] = useState(() => getDraft(item));
  const [initial] = useState(() => recovered ?? item);
  const [body, setBody] = useState(initial.body);
  const [status, setStatus] = useState<Status>(
    !recovered && item.version > 0 ? "saved" : "editing",
  );
  const [draftSafe, setDraftSafe] = useState(true);
  const draft = useRef(initial);
  const busy = useRef(false);
  const mounted = useRef(true);
  const notifySaved = useRef(onSaved);
  useEffect(() => {
    notifySaved.current = onSaved;
  }, [onSaved]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const save = useCallback(
    async (asCopy = false) => {
      if (
        busy.current ||
        (!draft.current.body.trim() && draft.current.version === 0)
      )
        return;
      busy.current = true;
      setStatus("saving");
      const snapshot = {
        ...draft.current,
        ...(asCopy ? { id: crypto.randomUUID(), version: 0 } : {}),
      };
      try {
        const { data, error } = await client.rpc("save_note", {
          p_id: snapshot.id,
          p_book: snapshot.book,
          p_chapter: snapshot.chapter,
          p_verses: snapshot.verses,
          p_translation: snapshot.translation,
          p_body: snapshot.body,
          p_version: snapshot.version,
        });
        if (error) throw error;
        const saved = data as StudyItem;
        if (!saved?.id) throw new Error("Save was not confirmed.");
        clearDraft(draft.current);
        draft.current = { ...saved, body: draft.current.body };
        if (draft.current.body !== saved.body) saveDraft(draft.current);
        notifySaved.current(saved);
        if (mounted.current)
          setStatus(draft.current.body === saved.body ? "saved" : "editing");
      } catch (e) {
        const stored = saveDraft(draft.current);
        if (mounted.current) setDraftSafe(stored);
        if (mounted.current)
          setStatus(
            (e as { code?: string }).code === "40001" ? "conflict" : "error",
          );
      } finally {
        busy.current = false;
      }
    },
    [client],
  );
  useEffect(() => {
    if (status !== "editing" || (!body.trim() && draft.current.version === 0))
      return;
    const timer = setTimeout(() => void save(), 850);
    return () => clearTimeout(timer);
  }, [body, status, save]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (status !== "saved" && (body.trim() || draft.current.version > 0)) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [status, body]);
  function change(value: string) {
    draft.current = { ...draft.current, body: value };
    setBody(value);
    setDraftSafe(saveDraft(draft.current));
    if (status !== "conflict" && status !== "saving") setStatus("editing");
  }
  async function loadCloudVersion() {
    const { data, error } = await client
      .from("study_items")
      .select("*")
      .eq("id", item.id)
      .single();
    if (error || !data) {
      setStatus("error");
      return;
    }
    clearDraft(draft.current);
    draft.current = data as StudyItem;
    setBody(data.body);
    setStatus("saved");
    notifySaved.current(data as StudyItem);
  }
  return (
    <section className="note-editor">
      <div className="editor-heading">
        <span className="eyebrow">NOTE</span>
        <button
          className="icon-button"
          aria-label="Close note"
          onClick={() => {
            if (
              !draftSafe &&
              status !== "saved" &&
              !confirm(
                "This draft could not be stored on your device. Close and discard unsaved changes?",
              )
            )
              return;
            onClose();
          }}
        >
          <X size={17} />
        </button>
      </div>
      <h3>{reference(item)}</h3>
      <span className="translation-tag">{item.translation}</span>
      <label className="sr-only" htmlFor="note-body">
        Your note
      </label>
      <textarea
        id="note-body"
        value={body}
        onChange={(e) => change(e.target.value)}
        maxLength={20000}
        placeholder="Write a note…"
        autoFocus
      />
      <div className="save-status" role="status">
        {status === "saved" ? (
          <>
            <Check size={14} />
            Saved to your account
          </>
        ) : status === "saving" ? (
          <>
            <Cloud size={14} />
            Saving…
          </>
        ) : status === "conflict" ? (
          <>
            <AlertCircle size={14} />
            Changed on another device
          </>
        ) : status === "error" ? (
          <>
            <AlertCircle size={14} />
            {draftSafe
              ? "Not synced. Draft kept on this device."
              : "Not synced. Keep this editor open to retry."}
          </>
        ) : (
          <>
            <Cloud size={14} />
            {body.trim()
              ? "Draft on this device"
              : "Your words will be saved automatically"}
          </>
        )}
      </div>
      {!draftSafe && (
        <p className="form-error">
          Device storage is unavailable. Keep this editor open until your note
          is saved.
        </p>
      )}
      {status === "error" && (
        <button className="button secondary" onClick={() => void save()}>
          <RotateCcw size={15} />
          Retry saving
        </button>
      )}
      {status === "conflict" && (
        <div className="conflict-actions">
          <p className="muted">
            Keep both versions by saving your draft as a new note, or discard
            this draft and load the saved version.
          </p>
          <button className="button primary" onClick={() => void save(true)}>
            Save draft as a copy
          </button>
          <button
            className="text-button"
            onClick={() => void loadCloudVersion()}
          >
            Discard draft and use saved note
          </button>
        </div>
      )}
    </section>
  );
}
