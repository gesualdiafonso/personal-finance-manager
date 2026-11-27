"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AureonMonogram } from "@/components/brand/aureon-logo";
import { es } from "@/lib/i18n/es";
import { useAuth } from "./auth-context";

export const LOGIN_PATH = "/entrar";
export const REGISTER_PATH = "/registro";

/** Where to go back after signing in: only paths of this app, never another origin. */
export function safeNext(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/entrar") || raw.startsWith("/registro")) return "/";
  return raw;
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

/**
 * Protects every route of the application group: nothing inside it — navigation included —
 * renders until a valid local session is confirmed. Without one, it sends the user to
 * /entrar (or /registro on a device with no account yet), remembering the page asked for.
 * The static HTML of these routes therefore holds only this splash, never financial panels.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { status, hasAccount } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (status !== "signed-out") return;
    const next = safeNext(window.location.pathname + window.location.search + window.location.hash);
    const target = hasAccount ? LOGIN_PATH : REGISTER_PATH;
    router.replace(next === "/" ? target : `${target}?next=${encodeURIComponent(next)}`);
  }, [status, hasAccount, router]);
  if (status !== "signed-in") return <AuthSplash />;
  return <>{children}</>;
}
