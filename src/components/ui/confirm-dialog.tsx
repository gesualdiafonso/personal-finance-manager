"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { es } from "@/lib/i18n/es";
import { Button } from "./button";

/**
 * Confirmation before any destructive or balance-changing operation (Step 03 §8).
 * Centred native <dialog>; Esc and the scrim cancel. While `busy`, nothing can be clicked twice.
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  destructive = false,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: ReactNode;
  children: ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      role="alertdialog"
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onCancel();
      }}
      className="m-auto w-full max-w-md rounded-md bg-surface p-0 text-ink shadow-overlay backdrop:bg-scrim"
    >
      {open && (
        <div className="p-6">
          <h2 id={titleId} className="type-heading">
            {title}
          </h2>
          <div className="mt-3 type-body text-ink-2">{children}</div>
          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={onCancel}
              disabled={busy}
            >
              {es.common.cancel}
            </Button>
            <Button
              type="button"
              variant={destructive ? "destructive" : "primary"}
              onClick={onConfirm}
              disabled={busy}
              aria-busy={busy}
            >
              {confirmLabel}
            </Button>
          </div>
        </div>
      )}
    </dialog>
  );
}
