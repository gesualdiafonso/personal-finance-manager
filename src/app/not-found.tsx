import Link from "next/link";
import { es } from "@/lib/i18n/es";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[520px] flex-col justify-center px-6">
      <div className="mb-2 type-label text-ink-2">404</div>
      <h1 className="mb-6 type-title-page-mobile">{es.errors.notFoundTitle}</h1>
      <Link href="/" className="type-nav text-lake underline-offset-4 hover:underline">
        {es.errors.backHome}
      </Link>
    </main>
  );
}
