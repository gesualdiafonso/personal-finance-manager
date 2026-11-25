"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import {
  isOnTransactions,
  NEW_TRANSACTION_EVENT,
  NEW_TRANSACTION_HREF,
} from "@/features/transactions/new-transaction";

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
  );
}

/**
 * Global shortcuts (responsivo.md, desktop). Step 01 wires only `N`, shown on the sidebar
 * button; ⌘K, `/`, ←/→, E, J/K arrive with the features that need them.
 */
export function KeyboardShortcuts() {
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.defaultPrevented ||
        e.metaKey ||
        e.ctrlKey ||
        e.altKey ||
        isTyping(e.target)
      )
        return;
      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        // Opens the new-transaction sheet (D4-15).
        if (isOnTransactions(pathname))
          window.dispatchEvent(new Event(NEW_TRANSACTION_EVENT));
        else router.push(NEW_TRANSACTION_HREF);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, pathname]);
  return null;
}
