import { Suspense } from "react";
import type { Metadata } from "next";
import { AuthSplash } from "@/features/auth/auth-gate";
import { LoginScreen } from "@/features/auth/auth-screens";
import { es } from "@/lib/i18n/es";

export const metadata: Metadata = { title: es.auth.loginTitle };

export default function LoginPage() {
  return (
    <Suspense fallback={<AuthSplash />}>
      <LoginScreen />
    </Suspense>
  );
}
