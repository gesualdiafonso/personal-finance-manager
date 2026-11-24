import type { Metadata } from "next";
import { CardsPage } from "@/features/cards/cards-page";
import { AREAS } from "@/lib/config/navigation";

export const metadata: Metadata = { title: AREAS.cards.label };

/** Static shell; cards are read on the client from this device's IndexedDB. */
export default function Page() {
  return <CardsPage />;
}
