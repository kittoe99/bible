"use client";

import {
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import Dialog from "./dialog";

export type PickerOption = {
  value: string;
  label: string;
  description?: string;
  group?: string;
};

export default function ReaderPicker({
  label,
  value,
  displayValue,
  options,
  onChange,
  searchable = false,
  grid = false,
  dark = false,
}: {
  label: string;
  value: string;
  displayValue: string;
  options: PickerOption[];
  onChange: (value: string) => void;
  searchable?: boolean;
  grid?: boolean;
  dark?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [placement, setPlacement] = useState<CSSProperties>({});
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const id = useId();
  const matches = options.filter((option) =>
    `${option.label} ${option.description ?? ""}`
      .toLowerCase()
      .includes(query.toLowerCase().trim()),
  );
  const selectedIndex = Math.max(
    0,
    matches.findIndex((option) => option.value === value),
  );
  const groups = [...new Set(matches.map((option) => option.group ?? ""))];
  const typeahead = useRef({ text: "", time: 0 });

  function show() {
    const rect = trigger.current!.getBoundingClientRect();
    const width = Math.min(340, window.innerWidth - 24);
    const top = Math.max(
      12,
      Math.min(rect.bottom + 10, window.innerHeight - 280),
    );
    setPlacement({
      "--picker-left": `${Math.max(12, Math.min(rect.left, window.innerWidth - width - 12))}px`,
      "--picker-top": `${top}px`,
      "--picker-room": `${window.innerHeight - top - 16}px`,
    } as CSSProperties);
    setQuery("");
    setOpen(true);
  }
  function focusOption(index: number) {
    const elements =
      list.current?.querySelectorAll<HTMLButtonElement>('[role="option"]');
    const target = elements?.[Math.max(0, Math.min(index, matches.length - 1))];
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: "nearest" });
  }
  function handleKeys(event: KeyboardEvent<HTMLDivElement>) {
    const elements = Array.from(
      list.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ??
        [],
    );
    const index = elements.indexOf(document.activeElement as HTMLButtonElement);
    let next: number | undefined;
    if (event.key === "ArrowDown") next = index + (grid ? 5 : 1);
    if (event.key === "ArrowUp") next = index - (grid ? 5 : 1);
    if (grid && event.key === "ArrowRight") next = index + 1;
    if (grid && event.key === "ArrowLeft") next = index - 1;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = matches.length - 1;
    if (next !== undefined) {
      event.preventDefault();
      focusOption(next);
      return;
    }
    if (
      event.key.length === 1 &&
      event.key !== " " &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      const now = event.timeStamp;
      typeahead.current = {
        text:
          now - typeahead.current.time > 700
            ? event.key
            : typeahead.current.text + event.key,
        time: now,
      };
      const found = matches.findIndex((option) =>
        option.label
          .toLowerCase()
          .startsWith(typeahead.current.text.toLowerCase()),
      );
      if (found >= 0) {
        event.preventDefault();
        focusOption(found);
      }
    }
  }
  function renderOption(option: PickerOption) {
    const index = matches.indexOf(option);
    const selected = option.value === value;
    return (
      <button
        type="button"
        role="option"
        aria-selected={selected}
        aria-label={
          option.description
            ? `${option.label} — ${option.description}`
            : option.label
        }
        data-picker-autofocus={!searchable && selected ? "" : undefined}
        tabIndex={index === selectedIndex ? 0 : -1}
        key={option.value}
        className={`picker-option ${selected ? "is-selected" : ""}`}
        onClick={() => {
          onChange(option.value);
          setOpen(false);
        }}
      >
        <span>
          <span className="picker-option-label">{option.label}</span>
          {option.description && (
            <span className="picker-option-description">
              {option.description}
            </span>
          )}
        </span>
        {selected && !grid && <Check size={16} aria-hidden="true" />}
      </button>
    );
  }

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={`picker-trigger ${dark ? "picker-trigger-dark" : ""}`}
        aria-label={`${label}: ${displayValue}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={show}
      >
        <span>{displayValue}</span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open && (
        <Dialog
          title={`Choose ${label.toLowerCase()}`}
          onClose={() => setOpen(false)}
          className={`picker-modal ${grid ? "chapter-picker-modal" : ""}`}
          style={placement}
          initialFocusSelector="[data-picker-autofocus]"
        >
          <div id={id} className="picker-content">
            {searchable && (
              <div className="picker-search">
                <Search size={17} aria-hidden="true" />
                <input
                  data-picker-autofocus=""
                  aria-label={`Search ${label.toLowerCase()}s`}
                  placeholder="Search books"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowDown") {
                      event.preventDefault();
                      focusOption(selectedIndex);
                    }
                  }}
                />
              </div>
            )}
            <div
              className={`picker-options ${grid ? "picker-grid" : ""}`}
              role="listbox"
              aria-label={`${label} choices`}
              ref={list}
              onKeyDown={handleKeys}
            >
              {groups.map((group) =>
                group ? (
                  <div role="group" aria-label={group} key={group}>
                    <div className="picker-group-label" aria-hidden="true">
                      {group}
                    </div>
                    {matches
                      .filter((option) => option.group === group)
                      .map(renderOption)}
                  </div>
                ) : (
                  matches.filter((option) => !option.group).map(renderOption)
                ),
              )}
            </div>
            {!matches.length && (
              <p className="picker-no-results" role="status">
                No books found.
              </p>
            )}
          </div>
        </Dialog>
      )}
    </>
  );
}
