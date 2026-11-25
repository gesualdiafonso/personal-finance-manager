import { AureonLogo, AureonMonogram } from "@/components/brand/aureon-logo";
import { es } from "@/lib/i18n/es";

/** Configuración → Acerca de: the AUREON logo, brand lines and version (docs/branding). */
export function AboutBrand() {
  return (
    <section
      aria-labelledby="acerca"
      className="grid gap-4 border-t border-line py-6 desktop:grid-cols-12 desktop:gap-6"
      data-testid="about-brand"
    >
      <div className="desktop:col-span-4">
        <h2 id="acerca" className="type-heading">
          {es.settings.about}
        </h2>
        <p className="type-body-sm text-ink-2">{es.settings.aboutHint}</p>
      </div>
      <div className="grid gap-5 desktop:col-span-6">
        <AureonLogo descriptor className="h-12 w-auto max-w-full" />
        <div className="flex items-start gap-4">
          <AureonMonogram className="mt-1 size-9" />
          <div lang="en">
            <p className="brand-statement">{es.brand.tagline}</p>
            <p className="mt-1 type-body-sm text-ink-2">
              {es.brand.taglineSecondary}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
