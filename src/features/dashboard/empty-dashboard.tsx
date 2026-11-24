import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { CurrentMonthTitle, TodayLabel } from "@/components/shared/current-date";
import { Button } from "@/components/ui/button";
import { AREAS } from "@/lib/config/navigation";
import { formatMoneyParts } from "@/lib/formatting/money";
import { es } from "@/lib/i18n/es";
import { ZERO } from "@/types/money";

/**
 * Dashboard in its approved empty state (dashboard.md, "Vazio (primeiro uso)"): the hero
 * shows $ 0 in ink-2, one sentence and a secondary action; the lower sections only appear
 * once there is data (Step 02+).
 */
export function EmptyDashboard() {
  const zero = formatMoneyParts(ZERO, { cents: "auto" });
  return (
    <>
      <PageHeader label={<TodayLabel />} title={<CurrentMonthTitle />} />
      <section aria-labelledby="saldo" className="max-w-[640px]">
        <h2 id="saldo" className="type-label text-ink-2">
          {es.dashboard.availableBalance}
        </h2>
        <p
          className="mt-3.5 mb-5 type-display-hero-mobile text-ink-2 desktop:type-display-hero"
          data-testid="hero-balance"
          aria-label={`${zero.symbol} ${zero.whole}`}
        >
          {zero.symbol}
          {" "}
          {zero.whole}
        </p>
        <p className="mb-4 type-body text-ink-2">{es.dashboard.emptyHint}</p>
        <Button asChild variant="secondary">
          <Link href={AREAS.accounts.href}>{es.dashboard.addAccount}</Link>
        </Button>
      </section>
    </>
  );
}
