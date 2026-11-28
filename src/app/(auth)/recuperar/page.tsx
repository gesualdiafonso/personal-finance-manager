import type { Metadata } from "next";
import { RecoverScreen } from "@/features/auth/cloud-screens";
import { es } from "@/lib/i18n/es";

export const metadata: Metadata = { title: es.cloudAuth.recoverTitle };

export default function RecoverPage() {
  return <RecoverScreen />;
}
