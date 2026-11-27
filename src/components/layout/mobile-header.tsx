"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AureonLogo } from "@/components/brand/aureon-logo";
import { ProfileMenu, ThemeToggle } from "@/components/brand/brand-controls";
import { es } from "@/lib/i18n/es";

/** Phone and tablet portrait (<1024px): AUREON logo, theme switch and profile access. */
export function MobileHeader() {
  return <MobileHeaderView pathname={usePathname()} />;
}

export function MobileHeaderView({ pathname }: { pathname: string }) {
  return (
    <header
      className="mb-8 flex items-center justify-between gap-3 landscape:hidden"
      data-testid="mobile-header"
    >
      <Link href="/" aria-label={es.brand.home} className="block">
        <AureonLogo className="h-7 w-auto" />
      </Link>
      <div className="flex items-center gap-1">
        <ThemeToggle />
        <ProfileMenu pathname={pathname} compact placement="down" />
      </div>
    </header>
  );
}
