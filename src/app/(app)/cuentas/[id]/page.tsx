import type { Metadata } from "next";
import { Suspense } from "react";
import { AccountDetailPage } from "@/features/accounts/account-detail-page";
import { AREAS } from "@/lib/config/navigation";

export const metadata: Metadata = { title: AREAS.accounts.label };

/**
 * The same static shell for every account: the id is read on the client from the address
 * bar and the data from IndexedDB, so the shell works offline for any id (D3-10).
 * "_" is the placeholder id prerendered and precached by the service worker.
 */
export function generateStaticParams() {
  return [{ id: "_" }];
}

export default function Page() {
  // The shell for ids not prerendered is client-rendered (Next.js "Render in Browser" bailout):
  // it needs a Suspense boundary.
  return (
    <Suspense>
      <AccountDetailPage />
    </Suspense>
  );
}
