import type { Metadata } from "next";
import { ResetPasswordScreen } from "@/features/auth/cloud-screens";
import { es } from "@/lib/i18n/es";

export const metadata: Metadata = { title: es.cloudAuth.resetTitle, referrer: "no-referrer" };

export default function ResetPage() {
  return <ResetPasswordScreen />;
}
