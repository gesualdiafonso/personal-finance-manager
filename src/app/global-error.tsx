"use client";

/** Last-resort boundary when the root layout itself fails: no providers, no fonts. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="es">
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#F4F0E7", color: "#252923", padding: 24 }}>
        <h1>Algo salió mal</h1>
        <button type="button" onClick={reset}>
          Reintentar
        </button>
      </body>
    </html>
  );
}
