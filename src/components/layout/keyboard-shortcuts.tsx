"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { AREAS } from "@/lib/config/navigation";

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/**
 * Global shortcuts (responsivo.md, desktop). Step 01 wires only `N`, shown on the sidebar
 * button; ⌘K, `/`, ←/→, E, J/K arrive with the features that need them.
 */
export function KeyboardShortcuts() {
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        router.push(AREAS.transactions.href);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);
  return null;
}
