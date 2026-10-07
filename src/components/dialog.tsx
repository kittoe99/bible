"use client";
import { useEffect, useRef, type CSSProperties } from "react";
import { X } from "lucide-react";
export default function Dialog({
  title,
  children,
  onClose,
  className = "",
  style,
  initialFocusSelector,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  className?: string;
  style?: CSSProperties;
  initialFocusSelector?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const closing = useRef(false);
  useEffect(() => {
    const dialog = ref.current;
    const previousFocus = document.activeElement as HTMLElement | null;
    dialog?.showModal();
    if (initialFocusSelector)
      dialog?.querySelector<HTMLElement>(initialFocusSelector)?.focus();
    return () => {
      dialog?.close();
      if (previousFocus?.isConnected)
        previousFocus.focus({ preventScroll: true });
    };
  }, [initialFocusSelector]);
  function dismiss() {
    const dialog = ref.current;
    if (!dialog || closing.current) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      onClose();
      return;
    }
    closing.current = true;
    const animation = dialog.animate(
      [
        { opacity: 1, transform: "translateY(0) scale(1)" },
        { opacity: 0, transform: "translateY(12px) scale(.98)" },
      ],
      { duration: 150, easing: "ease-in", fill: "forwards" },
    );
    void animation.finished
      .then(() => {
        if (dialog.isConnected) onClose();
      })
      .catch(() => {
        closing.current = false;
      });
  }
  return (
    <dialog
      ref={ref}
      className={`modal ${className}`}
      style={style}
      onKeyDown={(event) => {
        if (event.key === "Escape") event.stopPropagation();
      }}
      onCancel={(event) => {
        event.preventDefault();
        dismiss();
      }}
      onClick={(e) => {
        if (e.target !== ref.current) return;
        const bounds = ref.current.getBoundingClientRect();
        if (
          e.clientX < bounds.left ||
          e.clientX > bounds.right ||
          e.clientY < bounds.top ||
          e.clientY > bounds.bottom
        )
          dismiss();
      }}
      aria-label={title}
    >
      <div className="modal-heading">
        <h2>{title}</h2>
        <button
          className="icon-button"
          onClick={dismiss}
          aria-label="Close dialog"
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
