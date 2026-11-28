import type { Metadata } from "next";
import { VerifyEmailScreen } from "@/features/auth/cloud-screens";
import { es } from "@/lib/i18n/es";

export const metadata: Metadata = { title: es.cloudAuth.verifyTitle };

export default function VerifyPage() {
  return <VerifyEmailScreen />;
}
