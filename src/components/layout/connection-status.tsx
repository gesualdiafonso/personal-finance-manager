"use client";

import { useEffect, useRef, useState } from "react";
import { useOnline } from "@/hooks/use-pwa";
import { es } from "@/lib/i18n/es";

/**
 * Connection state (Step 09). The app is local-first: every read and write goes to this
 * device's IndexedDB, so going offline changes nothing about the data — this line only says
 * so. It never claims a sync (there is none, D1). When the network returns it says it once
 * and disappears.
 */
export function ConnectionStatus() {
  const online = useOnline();
  const [restored, setRestored] = useState(false);
  const wasOffline = useRef(false);
  useEffect(() => {
    if (!online) {
      wasOffline.current = true;
      return;
    }
    if (!wasOffline.current) return;
    wasOffline.current = false;
    setRestored(true);
    const t = setTimeout(() => setRestored(false), 4000);
    return () => clearTimeout(t);
  }, [online]);
  if (online && !restored) return null;
  return (
    <p
      role="status"
      aria-live="polite"
      data-testid={online ? "connection-restored" : "connection-offline"}
      className="-mt-6 mb-8 flex items-start gap-2 rounded-sm bg-paper-2 px-3 py-2 type-body-sm text-ink-2 desktop:-mt-2 print:hidden"
    >
      <span aria-hidden="true" className={online ? "mt-1.5 size-1.5 shrink-0 rounded-full bg-forest" : "mt-1.5 size-1.5 shrink-0 rounded-full bg-warning"} />
      {online ? es.pwa.backOnline : es.pwa.offline}
    </p>
  );
}
