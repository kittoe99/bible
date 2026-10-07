"use client";
import { useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { BOOKS } from "@/lib/bible";
import { chapterKey } from "@/lib/use-reading-progress";
import Dialog from "./dialog";

export default function ReadingProgress({
  completed,
  ready,
  signedIn,
  error,
  currentBook,
  onClose,
  onOpen,
  onSignIn,
  onRetry,
}: {
  completed: Set<string>;
  ready: boolean;
  signedIn: boolean;
  error: string;
  currentBook: string;
  onClose: () => void;
  onOpen: (book: string, chapter: number) => void;
  onSignIn: () => void;
  onRetry: () => void;
}) {
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(currentBook);
  const total = BOOKS.reduce((sum, book) => sum + book[2], 0);
  const percentage = Math.floor((completed.size / total) * 100);
  return (
    <Dialog
      title="Reading progress"
      className="progress-dialog"
      onClose={onClose}
    >
      {!signedIn ? (
        <div className="progress-signin">
          <p>Sign in to keep track of the chapters you’ve read.</p>
          <button className="button primary" onClick={onSignIn}>
            Sign in
          </button>
        </div>
      ) : (
        <>
          {error && (
            <div className="progress-error" role="alert">
              <span>{error}</span>
              <button onClick={onRetry}>Retry sync</button>
            </div>
          )}
          {!ready ? (
            !error && <p role="status">Loading progress…</p>
          ) : (
            <>
              <div className="progress-overview">
                <div>
                  <strong>{completed.size.toLocaleString()}</strong>
                  <span> / {total.toLocaleString()} chapters</span>
                </div>
                <span>{percentage}%</span>
              </div>
              <progress
                aria-label="Bible reading progress"
                max={total}
                value={completed.size}
              />
              <p className="progress-caption">
                Completed chapters have a check. Tap a chapter to read.
              </p>
              <label className="progress-search">
                <Search size={16} />
                <input
                  aria-label="Search progress books"
                  placeholder="Find a book…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
              <div className="progress-books">
                {BOOKS.filter((b) =>
                  b[1].toLowerCase().includes(search.toLowerCase()),
                ).map(([id, name, chapters]) => {
                  const count = Array.from({ length: chapters }, (_, i) =>
                    completed.has(chapterKey(id, i + 1)),
                  ).filter(Boolean).length;
                  return (
                    <div className="progress-book" key={id}>
                      <button
                        className="progress-book-heading"
                        aria-expanded={expanded === id}
                        aria-controls={`progress-${id}`}
                        onClick={() => setExpanded(expanded === id ? "" : id)}
                      >
                        <span>{name}</span>
                        <span>
                          {count === chapters && <Check size={14} />}
                          {count} / {chapters}
                          <ChevronDown size={16} />
                        </span>
                      </button>
                      {expanded === id && (
                        <div
                          id={`progress-${id}`}
                          className="progress-chapters"
                        >
                          {Array.from({ length: chapters }, (_, i) => {
                            const chapter = i + 1,
                              done = completed.has(chapterKey(id, chapter));
                            return (
                              <button
                                key={chapter}
                                className={done ? "is-complete" : ""}
                                aria-label={`${name} ${chapter}, ${done ? "completed" : "unread"}`}
                                onClick={() => onOpen(id, chapter)}
                              >
                                {chapter}
                                {done && <Check size={11} aria-hidden="true" />}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
                {!BOOKS.some((b) =>
                  b[1].toLowerCase().includes(search.toLowerCase()),
                ) && <p className="progress-caption">No books found.</p>}
              </div>
            </>
          )}
        </>
      )}
    </Dialog>
  );
}
