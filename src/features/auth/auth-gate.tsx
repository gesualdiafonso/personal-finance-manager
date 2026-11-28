"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { es } from "@/lib/i18n/es";
import { useAuth } from "./auth-state";
import { AuthSplash } from "./auth-ui";
import { LinkLocalDataScreen, VerificationPendingScreen } from "./cloud-screens";
import { LOGIN_PATH, safeNext } from "./paths";

export { LOGIN_PATH, REGISTER_PATH, safeNext } from "./paths";

export { AuthSplash } from "./auth-ui";

/**
 * Protects every route of the application group: nothing inside it — navigation included —
 * renders until a valid session is confirmed. Without one, it sends the user to /entrar —
 * always the login screen first — remembering the page asked for.
 * Cloud mode (Step 14): the proxy already refused the request on the server; this gate covers
 * the PWA shell served offline, an identity whose data is not linked yet ("needs-link") and
 * an unverified email. The static HTML of these routes holds only this splash.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { status, endedReason, offline } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (status !== "signed-out") return;
    const next = safeNext(window.location.pathname + window.location.search + window.location.hash);
    const params = new URLSearchParams();
    if (next !== "/") params.set("next", next);
    if (endedReason === "expired") params.set("motivo", "expired");
    const query = params.toString();
    router.replace(query ? `${LOGIN_PATH}?${query}` : LOGIN_PATH);
  }, [status, router, endedReason]);
  if (status === "needs-link") return <LinkLocalDataScreen />;
  if (status === "needs-verification") return <VerificationPendingScreen />;
  if (status !== "signed-in") return <AuthSplash />;
  return (
    <>
      {offline && (
        <p role="status" data-testid="offline-session" className="bg-paper-2 px-4 py-2 text-center type-body-sm text-ink-2">
          {es.cloudAuth.offlineBanner}
        </p>
      )}
      {children}
    </>
  );
}
