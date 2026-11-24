"use client";

import { Button } from "@/components/ui/button";
import { isAppError } from "@/lib/errors/app-error";
import { es } from "@/lib/i18n/es";

/** Route-level error boundary. Shows a coded message, never the error's internal text. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const message = isAppError(error) ? es.errors.codes[error.code] : es.errors.codes.UNKNOWN;
  return (
    <main className="mx-auto flex min-h-dvh max-w-[520px] flex-col justify-center px-6">
      <h1 className="mb-4 type-title-page-mobile">{es.errors.title}</h1>
      <p className="mb-6 type-body text-ink-2">{message}</p>
      <div>
        <Button variant="secondary" onClick={reset}>
          {es.errors.retry}
        </Button>
      </div>
    </main>
  );
}
