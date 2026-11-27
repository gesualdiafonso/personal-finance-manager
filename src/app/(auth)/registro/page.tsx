import type { Metadata } from "next";
import { RegisterScreen } from "@/features/auth/auth-screens";
import { es } from "@/lib/i18n/es";

export const metadata: Metadata = { title: es.auth.registerTitle };

export default function RegisterPage() {
  return <RegisterScreen />;
}
