"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { es } from "@/lib/i18n/es";
import { cn } from "@/lib/utils/cn";
import { Button } from "./button";

/**
 * Side sheet for create/edit (arquitetura.md "Criar / editar"): 440px on the right on
 * tablet and desktop, the list behind stays visible under the scrim; a full-height bottom
 * sheet on the phone. Built on the native <dialog> (D3-09): the browser traps focus,
 * closes on Esc and restores focus — no extra dependency.
 */
export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  testId,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  testId?: string;
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
      aria-labelledby={titleId}
      data-testid={testId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className={cn(
        "fixed inset-0 m-0 h-dvh max-h-dvh w-full max-w-full overflow-hidden bg-surface p-0 text-ink shadow-overlay backdrop:bg-scrim",
        "rounded-t-lg pt-2 tablet:left-auto tablet:w-(--layout-sheet) tablet:rounded-none tablet:pt-0",
      )}
    >
      {open && (
        <div className="flex h-full flex-col">
          <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4 tablet:px-6">
            <div className="min-w-0">
              <h2 id={titleId} className="type-heading">
                {title}
              </h2>
              {description && (
                <p className="mt-1 type-body-sm text-ink-2">{description}</p>
              )}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onClose}
              aria-label={es.common.close}
            >
              <X aria-hidden="true" className="size-4" />
            </Button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 tablet:px-6">
            {children}
          </div>
          {footer && (
            <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-4 safe-bottom tablet:px-6">
              {footer}
            </footer>
          )}
        </div>
      )}
    </dialog>
  );
}
