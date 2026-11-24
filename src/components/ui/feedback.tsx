"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils/cn";

/**
 * Success / failure feedback after an operation: one short sentence in a live region,
 * above the tab bar on phones. It never contains amounts or descriptions.
 */
type Message = { id: number; text: string; tone: "info" | "error" };
const FeedbackContext = createContext<
  (text: string, tone?: Message["tone"]) => void
>(() => {});

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<Message | null>(null);
  const show = useCallback(
    (text: string, tone: Message["tone"] = "info") =>
      setMessage({ id: Date.now(), text, tone }),
    [],
  );
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 5000);
    return () => clearTimeout(t);
  }, [message]);
  return (
    <FeedbackContext.Provider value={show}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-24 z-50 flex justify-center landscape:bottom-6 desktop:bottom-8"
      >
        {message && (
          <p
            key={message.id}
            data-testid="feedback"
            className={cn(
              "rounded-sm px-4 py-3 type-body-sm shadow-overlay",
              message.tone === "error"
                ? "bg-alert text-on-alert"
                : "bg-ink text-paper",
            )}
          >
            {message.text}
          </p>
        )}
      </div>
    </FeedbackContext.Provider>
  );
}

export function useFeedback() {
  return useContext(FeedbackContext);
}
