"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { AureonLogo, AureonMonogram } from "@/components/brand/aureon-logo";
import { ThemeToggle } from "@/components/brand/brand-controls";
import { Input } from "@/components/ui/field";
import { es } from "@/lib/i18n/es";
import { useAuth } from "./auth-state";
import { safeNext } from "./paths";

const t = es.auth;

export function nextFromUrl(): string {
  if (typeof window === "undefined") return "/";
  return safeNext(new URLSearchParams(window.location.search).get("next"));
}

/** Brand frame of the account screens: logo, title, one card, the account note. */
export function AuthFrame({ title, lead, children, footer, note = t.localNote }: { title: string; lead: string; children: ReactNode; footer: ReactNode; note?: string }) {
  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      <header className="flex items-center justify-between px-5 pt-5 tablet:px-10 tablet:pt-8">
        <AureonLogo className="h-7 w-auto" />
        <ThemeToggle />
      </header>
      <main id="contenido" className="mx-auto grid w-full max-w-[28rem] flex-1 content-center gap-8 px-5 py-10">
        <div className="grid gap-3">
          <span className="brand-rule" aria-hidden="true" />
          <h1 className="type-title-page-mobile tablet:type-title-page">{title}</h1>
          <p className="type-body text-ink-2">{lead}</p>
        </div>
        <div className="rounded-sm border border-line bg-surface p-5 tablet:p-6">{children}</div>
        <div className="grid gap-4 text-center">{footer}</div>
        <p className="type-caption text-ink-3">{note}</p>
      </main>
    </div>
  );
}

/** Password input with a show/hide switch (the value never leaves the field). */
export function PasswordInput({
  value,
  onChange,
  autoComplete,
  name,
  fieldProps,
}: {
  value: string;
  onChange: (v: string) => void;
  autoComplete: "current-password" | "new-password";
  name: string;
  fieldProps: { id: string; "aria-invalid": boolean; "aria-describedby": string | undefined };
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input
        {...fieldProps}
        name={name}
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        autoCapitalize="off"
        spellCheck={false}
        className="pr-12"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? t.hide : t.show}
        aria-pressed={visible}
        title={visible ? t.hide : t.show}
        className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-sm text-ink-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-focus-ring"
      >
        {visible ? <EyeOff aria-hidden="true" className="size-4.5" /> : <Eye aria-hidden="true" className="size-4.5" />}
      </button>
    </div>
  );
}

/**
 * Redirects a user who arrives here already signed in. `ownSubmit` is set by the screen's own
 * form, which then redirects itself (with its own destination).
 */
export function useLeaveWhenSignedIn(target: () => string, ownSubmit: { current: boolean }) {
  const { status } = useAuth();
  const router = useRouter();
  const inside = status === "signed-in" || status === "needs-link" || status === "needs-verification";
  useEffect(() => {
    if (inside && !ownSubmit.current) router.replace(target());
  }, [inside, router, target, ownSubmit]);
  return inside ? "signed-in" : status;
}

/** Neutral splash while the session is checked: no financial content, no navigation. */
export function AuthSplash() {
  return (
    <div className="grid min-h-dvh place-items-center" data-testid="auth-checking">
      <div className="grid justify-items-center gap-3">
        <AureonMonogram className="size-10 animate-pulse motion-reduce:animate-none" />
        <p role="status" className="type-body-sm text-ink-2">
          {es.auth.checking}
        </p>
      </div>
    </div>
  );
}
