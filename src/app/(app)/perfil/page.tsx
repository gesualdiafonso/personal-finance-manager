import type { Metadata } from "next";
import { ProfilePage } from "@/features/auth/profile-page";
import { es } from "@/lib/i18n/es";

export const metadata: Metadata = { title: es.profile.title };

export default function Page() {
  return <ProfilePage />;
}
