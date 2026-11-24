import type { Metadata } from "next";
import { Suspense } from "react";
import { CardDetailPage } from "@/features/cards/card-detail-page";
import { AREAS } from "@/lib/config/navigation";

export const metadata: Metadata = { title: AREAS.cards.label };

/** Same client shell for every card (id from the address bar); "_" is prerendered and precached (D3-10). */
export function generateStaticParams() {
  return [{ id: "_" }];
}

export default function Page() {
  // The shell for ids not prerendered is client-rendered (Next.js "Render in Browser" bailout):
  // it needs a Suspense boundary.
  return (
    <Suspense>
      <CardDetailPage />
    </Suspense>
  );
}
