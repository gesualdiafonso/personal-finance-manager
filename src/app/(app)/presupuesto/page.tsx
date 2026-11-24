import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/layout/placeholder-page";
import { AREAS } from "@/lib/config/navigation";

export const metadata: Metadata = { title: AREAS.budget.label };

export default function Page() {
  return <PlaceholderPage title={AREAS.budget.label} />;
}
