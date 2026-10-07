"use client";
/* eslint-disable react-hooks/set-state-in-effect -- Bootstrap and synchronize browser storage, auth, and fetched state. */
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  BookOpen,
  Bookmark,
  Search,
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  PanelLeftClose,
  PanelLeftOpen,
  X,
  Plus,
  Highlighter,
  StickyNote,
  Settings2,
  LogOut,
  Check,
  Menu,
  AlertCircle,
  RotateCcw,
  Trash2,
  Pencil,
  Cloud,
  Sun,
  ExternalLink,
} from "lucide-react";
import type { User } from "@supabase/supabase-js";
import {
  BOOKS,
  COLORS,
  DEFAULT_POSITION,
  TRANSLATIONS,
  adjacentChapter,
  parseReference,
  reference,
  restorePosition,
  availableTranslation,
  verseLabel,
  type Chapter,
  type Color,
  type Position,
  type StudyItem,
  type Translation,
} from "@/lib/bible";
import { getSupabase } from "@/lib/supabase";
import { readLocal, writeLocal } from "@/lib/storage";
import { clearDraft, getDrafts } from "@/lib/drafts";
import AuthDialog from "./auth-dialog";
import Dialog from "./dialog";
import NoteEditor from "./note-editor";
import { loadChapter } from "@/lib/scripture";
import ReaderPicker from "./reader-picker";

export default function BibleApp() {
  const [client] = useState(getSupabase);
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [position, setPosition] = useState<Position>(DEFAULT_POSITION);
  const [cloudReady, setCloudReady] = useState<string | null>(null);
  const userId = user?.id;
  const [chapterData, setChapterData] = useState<Chapter | null>(null);
  const [loading, setLoading] = useState(true);
  const [chapterError, setChapterError] = useState<{
    message: string;
    code: string;
  } | null>(null);
  const [retry, setRetry] = useState(0);
  const [items, setItems] = useState<StudyItem[]>([]);
  const [drafts, setDrafts] = useState<StudyItem[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [editor, setEditor] = useState<StudyItem | null>(null);
  const [view, setView] = useState<"read" | "saved">("read");
  const [pageDirection, setPageDirection] = useState(1);
  const [filter, setFilter] = useState<
    "all" | "note" | "bookmark" | "highlight"
  >("all");
  const [librarySearch, setLibrarySearch] = useState("");
  const [bookSearch, setBookSearch] = useState("");
  const [testament, setTestament] = useState<"old" | "new">("old");
  const [sidebar, setSidebar] = useState(false);
  const [desktop, setDesktop] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [recovery, setRecovery] = useState(false);
  const [settings, setSettings] = useState(false);
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState("");
  const [syncError, setSyncError] = useState("");
  const [syncRetry, setSyncRetry] = useState(0);
  const [mutating, setMutating] = useState(false);
  const [deleteItem, setDeleteItem] = useState<StudyItem | null>(null);
  const authUser = useRef<string | null>(null);
  const prefTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prefGeneration = useRef(0);
  const jumpRef = useRef<number[]>([]);
  const firstSelection = useRef<number | null>(null);
  const book = BOOKS.find((b) => b[0] === position.book)!;

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const update = () => {
      setDesktop(media.matches);
      setSidebar(false);
    };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const local = restorePosition(readLocal<Position>("stillword:reading"));
    if (local) setPosition(local);
    setReady(true);
    const params = new URLSearchParams(location.search);
    if (params.has("authError")) {
      setToast("That sign-in link could not be verified. Request a new link.");
      setAuthOpen(true);
    }
    if (params.get("recovery") === "1") {
      setRecovery(true);
      setAuthOpen(true);
    }
    if (!client) return;
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((event, session) => {
      const nextId = session?.user.id ?? null;
      if (authUser.current !== nextId) {
        authUser.current = nextId;
        setCloudReady(null);
        setItems([]);
        setEditor(null);
        setDrafts([]);
      }
      setUser(session?.user ?? null);
      if (event === "PASSWORD_RECOVERY") {
        setRecovery(true);
        setAuthOpen(true);
      }
    });
    return () => subscription.unsubscribe();
  }, [client]);

  const refresh = useCallback(async () => {
    const id = authUser.current;
    if (!client || !id) return;
    // Supabase responses default to 1,000 rows; paginate so older notes never disappear.
    const all: StudyItem[] = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await client
        .from("study_items")
        .select("*")
        .eq("user_id", id)
        .order("updated_at", { ascending: false })
        .order("id")
        .range(offset, offset + 499);
      if (authUser.current !== id) return;
      if (error) {
        setSyncError(
          "Your saved library could not sync. Check your connection, then retry.",
        );
        return;
      }
      all.push(...(data as StudyItem[]));
      if (data.length < 500) break;
    }
    setItems(all);
    setDrafts(getDrafts(id));
    setSyncError("");
  }, [client]);

  useEffect(() => {
    if (!client || !userId) return;
    let cancelled = false;
    const id = userId;
    const started = prefGeneration.current;
    void refresh();
    void client
      .from("reading_preferences")
      .select("*")
      .eq("user_id", id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled || authUser.current !== id) return;
        if (error) {
          setSyncError(
            "Reading preferences could not sync. Your position remains on this device.",
          );
          return;
        }
        const next = restorePosition(
          data
            ? {
                book: data.book,
                chapter: data.chapter,
                translation: data.translation,
                fontSize: data.font_size,
              }
            : null,
        );
        if (next && started === prefGeneration.current) {
          setPosition(next);
          writeLocal("stillword:reading", next);
        }
        setCloudReady(id);
      });
    const focus = () => {
      void refresh();
      if (document.visibilityState !== "visible" || prefTimer.current) return;
      const generation = prefGeneration.current;
      void client
        .from("reading_preferences")
        .select("*")
        .eq("user_id", id)
        .maybeSingle()
        .then(({ data }) => {
          if (
            cancelled ||
            authUser.current !== id ||
            generation !== prefGeneration.current ||
            !data
          )
            return;
          const next = restorePosition({
            book: data.book,
            chapter: data.chapter,
            translation: data.translation,
            fontSize: data.font_size,
          });
          if (next) {
            setPosition(next);
            writeLocal("stillword:reading", next);
            setCloudReady(id);
          }
        });
    };
    window.addEventListener("focus", focus);
    window.addEventListener("online", focus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", focus);
      window.removeEventListener("online", focus);
    };
  }, [client, userId, refresh, syncRetry]); // User id, rather than rotating auth tokens, identifies the library.

  useEffect(() => {
    if (!ready) return;
    writeLocal("stillword:reading", position);
    if (!client || !userId || cloudReady !== userId) return;
    const id = userId;
    prefTimer.current = setTimeout(() => {
      prefTimer.current = null;
      void client
        .from("reading_preferences")
        .upsert({
          user_id: id,
          book: position.book,
          chapter: position.chapter,
          translation: position.translation,
          font_size: position.fontSize,
          updated_at: new Date().toISOString(),
        })
        .then(({ error }) => {
          if (error && authUser.current === id)
            setSyncError(
              "Your reading position has not synced. It is saved on this device.",
            );
        });
    }, 600);
    return () => {
      if (prefTimer.current) clearTimeout(prefTimer.current);
      prefTimer.current = null;
    };
  }, [position, ready, client, userId, cloudReady]);

  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    setLoading(true);
    setChapterData(null);
    setChapterError(null);
    setSelected([]);
    firstSelection.current = null;
    void loadChapter(
      {
        book: position.book,
        chapter: position.chapter,
        translation: position.translation,
      },
      controller.signal,
    )
      .then((data) => {
        setChapterData(data);
        const jump = jumpRef.current;
        jumpRef.current = [];
        if (jump.length) {
          const available = jump.filter((v) =>
            data.verses.some((item) => item.number === v),
          );
          setSelected(available);
          if (available.length !== jump.length)
            setToast(
              "Some selected verses are not present in this translation. Their original references are preserved.",
            );
          setTimeout(
            () =>
              document.getElementById(`verse-${available[0]}`)?.scrollIntoView({
                block: "center",
                behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
                  .matches
                  ? "auto"
                  : "smooth",
              }),
            100,
          );
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setChapterError({
            message:
              error.message ?? "Unable to load this passage. Please try again.",
            code: error.code ?? "NETWORK",
          });
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [ready, position.book, position.chapter, position.translation, retry]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 6500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSidebar(false);
        setNotesOpen(false);
        setSelected([]);
      }
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);

  function navigate(update: Partial<Position>, verses: number[] = []) {
    const currentIndex =
      BOOKS.findIndex((b) => b[0] === position.book) * 200 + position.chapter;
    const nextIndex =
      BOOKS.findIndex((b) => b[0] === (update.book ?? position.book)) * 200 +
      (update.chapter ?? position.chapter);
    setPageDirection(nextIndex < currentIndex ? -1 : 1);
    if (!verses.length) window.scrollTo({ top: 0, behavior: "auto" });
    prefGeneration.current++;
    jumpRef.current = verses;
    setPosition((p) => ({ ...p, ...update }));
    setView("read");
    setSidebar(false);
    if (update.book)
      setTestament(
        BOOKS.findIndex((b) => b[0] === update.book) < 39 ? "old" : "new",
      );
    if (
      (!update.book || update.book === position.book) &&
      (!update.chapter || update.chapter === position.chapter) &&
      (!update.translation || update.translation === position.translation)
    ) {
      jumpRef.current = [];
      const available = verses.filter((v) =>
        chapterData?.verses.some((item) => item.number === v),
      );
      setSelected(available);
      if (available.length !== verses.length)
        setToast("Some selected verses are not present in this translation.");
      setTimeout(
        () =>
          document.getElementById(`verse-${available[0]}`)?.scrollIntoView({
            block: "center",
            behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
              .matches
              ? "auto"
              : "smooth",
          }),
        100,
      );
    }
  }
  function search(e: React.FormEvent) {
    e.preventDefault();
    const parsed = parseReference(query);
    if (!parsed) {
      setToast("Enter a reference such as John 3:16 or Psalm 23:1–4.");
      return;
    }
    navigate({ book: parsed.book, chapter: parsed.chapter }, parsed.verses);
    setQuery("");
  }
  function selectVerse(number: number, shift: boolean) {
    setSelected((current) => {
      if (shift && firstSelection.current !== null) {
        const start = Math.min(firstSelection.current, number),
          end = Math.max(firstSelection.current, number);
        return chapterData!.verses
          .filter((v) => v.number >= start && v.number <= end)
          .map((v) => v.number);
      }
      firstSelection.current = number;
      return current.includes(number)
        ? current.filter((v) => v !== number)
        : [...current, number].sort((a, b) => a - b);
    });
  }
  function requireUser() {
    if (!user) {
      setAuthOpen(true);
      return false;
    }
    return true;
  }
  async function annotate(
    kind: "highlight" | "bookmark",
    color: Color | null = null,
    remove = false,
  ) {
    if (!requireUser() || !client || !selected.length) return;
    setMutating(true);
    const id = authUser.current;
    try {
      const { error } = await client.rpc("set_annotations", {
        p_kind: kind,
        p_book: position.book,
        p_chapter: position.chapter,
        p_verses: selected,
        p_translation: position.translation,
        p_color: color,
        p_remove: remove,
      });
      if (error) throw error;
      if (authUser.current === id) {
        await refresh();
        setToast(
          remove
            ? "Removed from your saved library."
            : kind === "bookmark"
              ? "Passage bookmarked."
              : "Highlight saved.",
        );
      }
    } catch {
      setToast(
        "Your change was not saved. Check your connection and try again.",
      );
    } finally {
      setMutating(false);
    }
  }
  function newNote() {
    if (!requireUser() || !selected.length) return;
    setEditor({
      id: crypto.randomUUID(),
      user_id: user!.id,
      kind: "note",
      book: position.book,
      chapter: position.chapter,
      verses: [...selected],
      translation: position.translation,
      body: "",
      color: null,
      version: 0,
      updated_at: new Date().toISOString(),
    });
    setNotesOpen(true);
  }
  function savedItem(item: StudyItem) {
    if (item.user_id !== authUser.current) return;
    setItems((current) => [item, ...current.filter((i) => i.id !== item.id)]);
    setDrafts(getDrafts(item.user_id));
  }
  async function removeItem(item: StudyItem) {
    if (!client) return;
    setMutating(true);
    try {
      if (item.version > 0) {
        const { data, error } = await client
          .from("study_items")
          .delete()
          .eq("id", item.id)
          .eq("version", item.version)
          .select("id");
        if (error) throw error;
        if (!data.length) {
          setToast(
            "This item changed on another device. Refresh and try again.",
          );
          await refresh();
          return;
        }
      }
      clearDraft(item);
      setItems((current) => current.filter((i) => i.id !== item.id));
      setDrafts(user ? getDrafts(user.id) : []);
      if (editor?.id === item.id) setEditor(null);
      setDeleteItem(null);
      setToast("Removed from your library.");
    } catch {
      setToast("Unable to delete. Your item is still saved.");
    } finally {
      setMutating(false);
    }
  }
  const passageItems = items.filter(
    (i) => i.book === position.book && i.chapter === position.chapter,
  );
  const passageNotes = passageItems.filter((i) => i.kind === "note");
  const allBookmarked =
    selected.length > 0 &&
    selected.every((v) =>
      passageItems.some((i) => i.kind === "bookmark" && i.verses.includes(v)),
    );
  const mergedItems = [
    ...drafts,
    ...items.filter((i) => !drafts.some((d) => d.id === i.id)),
  ];
  const filtered = mergedItems.filter(
    (i) =>
      (filter === "all" || filter === i.kind) &&
      `${reference(i)} ${i.body} ${i.translation}`
        .toLowerCase()
        .includes(librarySearch.toLowerCase()),
  );
  const prev = adjacentChapter(position.book, position.chapter, -1),
    next = adjacentChapter(position.book, position.chapter, 1);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to reading
      </a>
      {sidebar && (
        <button
          className="drawer-backdrop"
          aria-label="Close navigation"
          onClick={() => setSidebar(false)}
        />
      )}
      <aside
        className={`sidebar ${sidebar ? "is-open" : ""}`}
        aria-label="Main navigation"
        inert={!sidebar && !desktop}
      >
        <Link href="/" className="brand">
          <span className="brand-icon">
            <BookOpen size={24} strokeWidth={1.6} />
          </span>
          Bible
        </Link>
        <button
          className="mobile-sidebar-close icon-button"
          onClick={() => setSidebar(false)}
          aria-label="Close navigation"
        >
          <X size={20} />
        </button>
        <nav className="primary-nav">
          <button
            className={view === "read" ? "active" : ""}
            onClick={() => {
              setView("read");
              setSidebar(false);
              setNotesOpen(false);
            }}
          >
            <BookOpen size={19} />
            Read the Bible
            <span className="nav-active-dot" />
          </button>
          <button
            className={view === "saved" ? "active" : ""}
            onClick={() => {
              setView("saved");
              setSidebar(false);
              setNotesOpen(false);
              if (user) void refresh();
            }}
          >
            <Bookmark size={19} />
            My saved library
            {items.length > 0 && <span className="count">{items.length}</span>}
          </button>
        </nav>
        <div className="library-heading">
          <span className="eyebrow">THE BIBLE</span>
          <span>66 books</span>
        </div>
        <div className="book-search">
          <Search size={15} />
          <input
            aria-label="Find a book"
            placeholder="Find a book…"
            value={bookSearch}
            onChange={(e) => setBookSearch(e.target.value)}
          />
        </div>
        <div className="testament-tabs">
          <button
            className={testament === "old" ? "active" : ""}
            onClick={() => setTestament("old")}
          >
            Old Testament
          </button>
          <button
            className={testament === "new" ? "active" : ""}
            onClick={() => setTestament("new")}
          >
            New Testament
          </button>
        </div>
        <nav className="book-list" aria-label="Bible books">
          {BOOKS.filter((b, i) =>
            bookSearch
              ? b[1].toLowerCase().includes(bookSearch.toLowerCase())
              : testament === "old"
                ? i < 39
                : i >= 39,
          ).map((b) => (
            <button
              key={b[0]}
              className={b[0] === position.book ? "active" : ""}
              onClick={() => navigate({ book: b[0], chapter: 1 })}
            >
              <span>{b[1]}</span>
              {b[0] === position.book ? (
                <ChevronRight size={15} />
              ) : (
                <span className="book-count">{b[2]}</span>
              )}
            </button>
          ))}
          {bookSearch &&
            !BOOKS.some((b) =>
              b[1].toLowerCase().includes(bookSearch.toLowerCase()),
            ) && <p className="muted small">No books found.</p>}
        </nav>
        <div className="sidebar-bottom">
          <button
            className="profile-button"
            aria-label="Reading settings"
            onClick={() => {
              setSettings(true);
              setSidebar(false);
            }}
          >
            <Settings2 size={19} /> <span>Settings</span>
          </button>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setSidebar(true)}
            >
              <Menu size={22} />
            </button>
            <span className="reader-title">
              {view === "read" ? "Bible" : "Saved"}
            </span>
          </div>
          <form className="reference-search" onSubmit={search}>
            <Search size={17} />
            <input
              aria-label="Go to a Bible reference"
              placeholder="Search reference, e.g. John 3:16"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button type="submit" aria-label="Find passage">
              <ArrowRight size={15} />
            </button>
          </form>
          <button
            className="top-account"
            aria-label={user ? "Account" : "Sign in"}
            onClick={() => (user ? setSettings(true) : setAuthOpen(true))}
          >
            {user ? (
              <span className="avatar small-avatar">
                {user.email?.slice(0, 1).toUpperCase()}
              </span>
            ) : (
              <>
                Sign in <ArrowRight size={15} />
              </>
            )}
          </button>
        </header>
        <main
          id="main"
          className="main-content"
          style={
            { "--page-offset": `${pageDirection * 14}px` } as CSSProperties
          }
        >
          {syncError && (
            <div className="sync-banner" role="alert">
              <AlertCircle size={17} />
              <span>{syncError}</span>
              <button onClick={() => setSyncRetry((n) => n + 1)}>Retry</button>
            </div>
          )}
          {view === "read" ? (
            <div
              className={`reading-layout ${notesOpen ? "notes-visible" : ""}`}
            >
              <section className="reader-card" aria-label="Bible reader">
                <div className="reader-toolbar">
                  <div className="chapter-picker">
                    <ReaderPicker
                      label="Book"
                      value={position.book}
                      displayValue={book[1]}
                      searchable
                      options={BOOKS.map((b, index) => ({
                        value: b[0],
                        label: b[1],
                        group: index < 39 ? "Old Testament" : "New Testament",
                      }))}
                      onChange={(value) =>
                        navigate({ book: value, chapter: 1 })
                      }
                    />
                    <span className="toolbar-divider" />
                    <ReaderPicker
                      label="Chapter"
                      value={String(position.chapter)}
                      displayValue={String(position.chapter)}
                      grid
                      options={Array.from({ length: book[2] }, (_, i) => ({
                        value: String(i + 1),
                        label: String(i + 1),
                      }))}
                      onChange={(value) => navigate({ chapter: Number(value) })}
                    />
                  </div>
                  <div className="reader-tools">
                    <ReaderPicker
                      label="Translation"
                      value={position.translation}
                      displayValue={position.translation}
                      dark
                      options={Object.entries(TRANSLATIONS).map(
                        ([value, description]) => ({
                          value,
                          label: value,
                          description,
                        }),
                      )}
                      onChange={(value) =>
                        navigate(
                          { translation: value as Translation },
                          selected,
                        )
                      }
                    />
                    <button
                      className="icon-button font-button"
                      aria-label="Adjust text size"
                      onClick={() => setSettings(true)}
                    >
                      Aa
                    </button>
                    <button
                      className="icon-button notes-toggle"
                      aria-label="Toggle notes panel"
                      onClick={() => setNotesOpen(!notesOpen)}
                    >
                      {notesOpen ? (
                        <PanelLeftClose size={19} />
                      ) : (
                        <PanelLeftOpen size={19} />
                      )}
                    </button>
                  </div>
                </div>
                <div
                  className="chapter-heading"
                  key={`${position.book}.${position.chapter}`}
                >
                  <h1 aria-label={`${book[1]} ${position.chapter}`}>
                    <span className="chapter-book">{book[1]}</span>
                    <span className="chapter-number">
                      {String(position.chapter).padStart(2, "0")}
                    </span>
                  </h1>
                </div>
                {loading ? (
                  <div
                    className="reading-skeleton"
                    aria-label="Loading chapter"
                    role="status"
                  >
                    {Array.from({ length: 9 }, (_, i) => (
                      <span
                        key={i}
                        style={{ width: `${i % 3 === 2 ? 76 : 100}%` }}
                      />
                    ))}
                    <p>Loading…</p>
                  </div>
                ) : chapterError ? (
                  <div className="chapter-empty">
                    <h2>Scripture unavailable</h2>
                    <p>{chapterError.message}</p>
                    <div className="empty-actions">
                      <button
                        className="button secondary"
                        onClick={() => setRetry((x) => x + 1)}
                      >
                        <RotateCcw size={15} />
                        Try again
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div
                      className="scripture"
                      key={`${position.book}.${position.chapter}.${position.translation}`}
                      style={{ fontSize: position.fontSize }}
                    >
                      {chapterData?.verses.map((verse) => {
                        const highlight = passageItems.find(
                          (i) =>
                            i.kind === "highlight" &&
                            i.verses.includes(verse.number),
                        );
                        const bookmarked = passageItems.some(
                          (i) =>
                            i.kind === "bookmark" &&
                            i.verses.includes(verse.number),
                        );
                        const noted = passageNotes.some((i) =>
                          i.verses.includes(verse.number),
                        );
                        return (
                          <button
                            key={verse.number}
                            id={`verse-${verse.number}`}
                            className={`verse ${selected.includes(verse.number) ? "selected" : ""} ${highlight?.color ? `highlight-${highlight.color}` : ""}`}
                            aria-pressed={selected.includes(verse.number)}
                            aria-label={`Verse ${verse.number}${bookmarked ? ", bookmarked" : ""}${highlight ? ", highlighted" : ""}${noted ? ", has notes" : ""}: ${verse.text}`}
                            onClick={(e) =>
                              selectVerse(verse.number, e.shiftKey)
                            }
                          >
                            <span className="verse-number">{verse.number}</span>
                            <span>{verse.text}</span>
                            <span className="verse-marks">
                              {bookmarked && (
                                <Bookmark size={12} fill="currentColor" />
                              )}
                              {noted && <StickyNote size={12} />}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <div className="scripture-attribution">
                      {chapterData?.copyright} ·{" "}
                      <a href="/copyright">Sources</a>
                    </div>
                  </>
                )}
                <div className="chapter-footer">
                  <button
                    className="text-button"
                    disabled={!prev}
                    onClick={() => prev && navigate(prev)}
                  >
                    <ChevronLeft size={16} />
                    Previous
                  </button>
                  <span>
                    {position.chapter} <span>of</span> {book[2]} chapters
                  </span>
                  <button
                    className="text-button"
                    disabled={!next}
                    onClick={() => next && navigate(next)}
                  >
                    Next chapter
                    <ChevronRight size={16} />
                  </button>
                </div>
              </section>
              <aside
                className={`notes-panel ${notesOpen ? "is-open" : ""}`}
                aria-label="Notes and reflections"
                inert={!notesOpen}
              >
                <div className="notes-panel-heading">
                  <span>
                    <StickyNote size={18} /> Notes
                  </span>
                  <button
                    className="icon-button"
                    aria-label="Close reflections"
                    onClick={() => setNotesOpen(false)}
                  >
                    <X size={16} />
                  </button>
                </div>
                {editor && client && user ? (
                  <NoteEditor
                    key={editor.id}
                    item={editor}
                    client={client}
                    onSaved={(saved) => {
                      savedItem(saved);
                      setEditor((current) =>
                        current?.id === editor.id ? saved : current,
                      );
                    }}
                    onClose={() => {
                      setEditor(null);
                      setDrafts(getDrafts(user.id));
                    }}
                  />
                ) : (
                  <>
                    {selected.length > 0 && (
                      <div className="note-create">
                        <button className="button secondary" onClick={newNote}>
                          <Plus size={16} />
                          Add note
                        </button>
                      </div>
                    )}
                    <div className="passage-notes">
                      <div className="section-label">
                        IN THIS CHAPTER <span>{passageNotes.length}</span>
                      </div>
                      {passageNotes.length ? (
                        passageNotes.map((note) => (
                          <button
                            className="note-preview"
                            key={note.id}
                            onClick={() => {
                              setEditor(note);
                              setNotesOpen(true);
                            }}
                          >
                            <span>
                              {reference(note)}
                              <span className="translation-tag">
                                {note.translation}
                              </span>
                            </span>
                            <p>{note.body}</p>
                            <small>
                              {new Date(note.updated_at).toLocaleDateString(
                                undefined,
                                { month: "short", day: "numeric" },
                              )}
                            </small>
                          </button>
                        ))
                      ) : (
                        <p className="empty-chapter-notes">
                          No notes in this chapter.
                        </p>
                      )}
                    </div>
                  </>
                )}
              </aside>
            </div>
          ) : (
            <section className="saved-card">
              <div className="saved-toolbar">
                <div className="saved-tabs">
                  {(["all", "note", "bookmark", "highlight"] as const).map(
                    (f) => (
                      <button
                        className={filter === f ? "active" : ""}
                        key={f}
                        onClick={() => setFilter(f)}
                      >
                        {f === "all"
                          ? "Everything"
                          : f === "note"
                            ? "Notes"
                            : f === "bookmark"
                              ? "Bookmarks"
                              : "Highlights"}
                      </button>
                    ),
                  )}
                </div>
                <div className="book-search">
                  <Search size={16} />
                  <input
                    aria-label="Search saved library"
                    placeholder="Search your library…"
                    value={librarySearch}
                    onChange={(e) => setLibrarySearch(e.target.value)}
                  />
                </div>
              </div>
              {!user ? (
                <div className="library-empty">
                  <Bookmark size={38} strokeWidth={1.2} />
                  <h1>Saved</h1>
                  <p>Sign in to view your saved passages and notes.</p>
                  <button
                    className="button primary"
                    onClick={() => setAuthOpen(true)}
                  >
                    Sign in to your library
                    <ArrowRight size={16} />
                  </button>
                </div>
              ) : filtered.length ? (
                <div className="saved-grid">
                  {filtered.map((item, index) => (
                    <article
                      key={item.id}
                      style={
                        { "--item-index": Math.min(index, 6) } as CSSProperties
                      }
                      className={`saved-item ${item.color ? `saved-${item.color}` : ""}`}
                    >
                      <div className="saved-item-type">
                        {item.kind === "note" ? (
                          <StickyNote size={15} />
                        ) : item.kind === "bookmark" ? (
                          <Bookmark size={15} />
                        ) : (
                          <Highlighter size={15} />
                        )}
                        <span>
                          {drafts.some((d) => d.id === item.id)
                            ? "UNSYNCED DRAFT"
                            : item.kind.toUpperCase()}
                        </span>
                        <span className="translation-tag">
                          {item.translation}
                        </span>
                      </div>
                      <button
                        className="saved-reference"
                        onClick={() => {
                          navigate(
                            {
                              book: item.book,
                              chapter: item.chapter,
                              translation: availableTranslation(
                                item.translation,
                              ),
                            },
                            item.verses,
                          );
                          if (item.kind === "note") {
                            setEditor(item);
                            setNotesOpen(true);
                          }
                        }}
                      >
                        {reference(item)}
                        <ArrowRight size={16} />
                      </button>
                      {item.kind === "note" && (
                        <p className="saved-note-body">{item.body}</p>
                      )}
                      <div className="saved-item-footer">
                        <span>
                          {new Date(item.updated_at).toLocaleDateString(
                            undefined,
                            { month: "short", day: "numeric", year: "numeric" },
                          )}
                        </span>
                        <div>
                          {item.kind === "note" && (
                            <button
                              className="icon-button"
                              aria-label={`Edit note on ${reference(item)}`}
                              onClick={() => {
                                navigate(
                                  {
                                    book: item.book,
                                    chapter: item.chapter,
                                    translation: availableTranslation(
                                      item.translation,
                                    ),
                                  },
                                  item.verses,
                                );
                                setEditor(item);
                                setNotesOpen(true);
                              }}
                            >
                              <Pencil size={15} />
                            </button>
                          )}
                          <button
                            className="icon-button"
                            disabled={mutating}
                            aria-label={`Delete ${item.kind} on ${reference(item)}`}
                            onClick={() =>
                              item.kind === "note"
                                ? setDeleteItem(item)
                                : void removeItem(item)
                            }
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="library-empty">
                  <h2>{librarySearch ? "No results." : "No saved items."}</h2>
                  <p>
                    {librarySearch
                      ? "Try a different word or passage reference."
                      : "Your notes, bookmarks, and highlights appear here."}
                  </p>
                  <button
                    className="button secondary"
                    onClick={() => setView("read")}
                  >
                    Return to reading
                    <ArrowRight size={16} />
                  </button>
                </div>
              )}
            </section>
          )}
        </main>
      </div>
      <nav
        className="bottom-nav"
        aria-label="App navigation"
        style={
          {
            "--tab-index": settings ? 2 : view === "saved" ? 1 : 0,
          } as CSSProperties
        }
      >
        <span className="nav-indicator" aria-hidden="true" />
        <button
          className={view === "read" && !settings ? "active" : ""}
          aria-label="Read the Bible"
          aria-current={view === "read" ? "page" : undefined}
          onClick={() => {
            setView("read");
            setNotesOpen(false);
          }}
        >
          <BookOpen size={22} />
          <span>Bible</span>
        </button>
        <button
          className={view === "saved" && !settings ? "active" : ""}
          aria-label="My saved library"
          aria-current={view === "saved" ? "page" : undefined}
          onClick={() => {
            setView("saved");
            setNotesOpen(false);
            if (user) void refresh();
          }}
        >
          <Bookmark size={22} />
          <span>Saved</span>
        </button>
        <button
          className={settings ? "active" : ""}
          aria-label="Reading settings"
          onClick={() => setSettings(true)}
        >
          <Settings2 size={22} />
          <span>Settings</span>
        </button>
      </nav>
      {selected.length > 0 && view === "read" && !notesOpen && (
        <div
          className="selection-bar"
          role="region"
          aria-label="Selected verse actions"
        >
          <span className="selection-reference">
            {book[1]} {position.chapter}:{verseLabel(selected)}
          </span>
          <div className="highlight-options">
            {COLORS.map((color) => (
              <button
                key={color}
                className={`color-dot highlight-${color}`}
                aria-label={`Highlight ${color}`}
                disabled={mutating}
                onClick={() => void annotate("highlight", color)}
              />
            ))}
            <button
              className="icon-button"
              aria-label="Remove highlight"
              disabled={mutating}
              onClick={() => void annotate("highlight", null, true)}
            >
              <X size={15} />
            </button>
          </div>
          <span className="toolbar-divider" />
          <button
            className="selection-action"
            aria-label={allBookmarked ? "Unmark" : "Bookmark"}
            onClick={() => void annotate("bookmark", null, allBookmarked)}
            disabled={mutating}
          >
            <Bookmark
              size={17}
              fill={allBookmarked ? "currentColor" : "none"}
            />
            <span>{allBookmarked ? "Unmark" : "Bookmark"}</span>
          </button>
          <button
            className="selection-action"
            aria-label="Add note"
            onClick={newNote}
          >
            <Pencil size={16} />
            <span>Add note</span>
          </button>
          <button
            className="icon-button"
            aria-label="Clear selection"
            onClick={() => setSelected([])}
          >
            <X size={17} />
          </button>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <span>{toast}</span>
          <button
            className="icon-button"
            aria-label="Dismiss message"
            onClick={() => setToast("")}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {authOpen && (
        <AuthDialog
          client={client}
          recovery={recovery}
          onClose={() => {
            setAuthOpen(false);
            setRecovery(false);
          }}
        />
      )}
      {settings && (
        <Dialog title="Settings" onClose={() => setSettings(false)}>
          <div className="setting-row">
            <div>
              <strong>Scripture text size</strong>
              <span>{position.fontSize}px</span>
            </div>
            <input
              type="range"
              aria-label="Scripture text size"
              min="16"
              max="30"
              value={position.fontSize}
              onChange={(e) => {
                prefGeneration.current++;
                setPosition((p) => ({
                  ...p,
                  fontSize: Number(e.target.value),
                }));
              }}
            />
            <p className="font-preview" style={{ fontSize: position.fontSize }}>
              Bible text
            </p>
          </div>
          <div className="setting-row">
            <strong>Appearance</strong>
            <span className="theme-choice">
              <Sun size={17} />
              Light
              <Check size={16} />
            </span>
          </div>
          <div className="setting-row">
            <strong>Your account</strong>
            {user ? (
              <>
                <p className="muted">{user.email}</p>
                <span className="small muted">
                  <Cloud size={14} /> Private cloud saving enabled
                </span>
                <button
                  className="button secondary"
                  onClick={async () => {
                    const { error } = await client!.auth.signOut();
                    if (error) {
                      setToast("Sign-out failed. Please try again.");
                      return;
                    }
                    setSettings(false);
                    setToast("Signed out. Your cloud notes are safely stored.");
                  }}
                >
                  <LogOut size={16} />
                  Sign out
                </button>
              </>
            ) : (
              <button
                className="button primary"
                onClick={() => {
                  setSettings(false);
                  setAuthOpen(true);
                }}
              >
                Sign in
                <ArrowRight size={16} />
              </button>
            )}
          </div>
          <a className="setup-link" href="/copyright">
            Scripture & privacy
          </a>
          <a className="setup-link" href="/setup">
            Connection & setup guide
            <ExternalLink size={14} />
          </a>
        </Dialog>
      )}
      {deleteItem && (
        <Dialog title="Delete note?" onClose={() => setDeleteItem(null)}>
          <p className="muted">
            Your note on {reference(deleteItem)} will be permanently removed
            from your account and this device’s drafts.
          </p>
          <div className="dialog-actions">
            <button
              className="button secondary"
              onClick={() => setDeleteItem(null)}
            >
              Keep note
            </button>
            <button
              className="button danger"
              disabled={mutating}
              onClick={() => void removeItem(deleteItem)}
            >
              {mutating ? "Deleting…" : "Delete note"}
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
