"use client";

import { Suspense, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { LogOut } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { FeedbackProvider, useFeedback } from "@/components/ui/feedback";
import { Field, Input, Select } from "@/components/ui/field";
import { CURRENCY_CODES, type CurrencyCode } from "@/domain/currency";
import { DATE_FORMATS, PROFILE_COUNTRIES, PROFILE_LANGUAGES, profileInitials, type DateFormat } from "@/domain/profile";
import { formatInstant } from "@/features/exchange/format";
import { isAppError } from "@/lib/errors/app-error";
import { es } from "@/lib/i18n/es";
import type { ProfileView } from "@/services/auth/auth-service";
import { checkPassword, CLOUD_PASSWORD_MIN_LENGTH } from "@/services/auth/password";
import { CloudAuthError, useAuth, useProfile } from "./auth-state";
import { PasswordInput } from "./auth-ui";
import { cloudErrorMessage } from "./cloud-screens";

const t = es.profile;

const FALLBACK_ZONES = ["America/Argentina/Buenos_Aires", "America/Argentina/Cordoba", "America/Argentina/Mendoza", "America/Montevideo", "America/Santiago", "America/Sao_Paulo", "America/Asuncion", "America/Mexico_City", "America/New_York", "Europe/Madrid", "Europe/Lisbon", "UTC"];
function timeZones(current: string): string[] {
  let zones: string[] = FALLBACK_ZONES;
  try {
    zones = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? FALLBACK_ZONES;
  } catch {
    // older engines
  }
  return zones.includes(current) ? zones : [current, ...zones];
}
const countryName = (() => {
  try {
    const names = new Intl.DisplayNames(["es-AR"], { type: "region" });
    return (code: string) => names.of(code) ?? code;
  } catch {
    return (code: string) => code;
  }
})();

/** Formulário archetype: explanation left, controls right (as in Configuración). */
function Section({ id, title, hint, children }: { id: string; title: string; hint: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="grid gap-4 border-t border-line py-6 desktop:grid-cols-12 desktop:gap-6">
      <div className="desktop:col-span-4">
        <h2 id={id} className="type-heading">
          {title}
        </h2>
        <p className="type-body-sm text-ink-2">{hint}</p>
      </div>
      <div className="grid min-w-0 gap-5 desktop:col-span-8">{children}</div>
    </section>
  );
}

type Draft = {
  fullName: string;
  email: string;
  phone: string;
  country: string;
  region: string;
  preferredCurrency: CurrencyCode;
  secondaryCurrency: CurrencyCode | "";
  language: string;
  timezone: string;
  dateFormat: DateFormat;
  numberFormat: string;
};
const toDraft = (v: ProfileView): Draft => ({
  fullName: v.profile.fullName,
  email: v.profile.email,
  phone: v.profile.phone,
  country: v.profile.country,
  region: v.profile.region,
  preferredCurrency: v.preferredCurrency,
  secondaryCurrency: v.profile.secondaryCurrency ?? "",
  language: v.profile.language,
  timezone: v.timezone,
  dateFormat: v.profile.dateFormat,
  numberFormat: v.numberFormat,
});

/** /perfil — the one global profile, its security settings and logout. */
export function ProfilePage() {
  const view = useProfile();
  if (!view) return null; // the gate guarantees a profile; nothing renders without one
  return (
    <FeedbackProvider>
      <PageHeader label={t.eyebrow} title={t.title} />
      <Suspense fallback={null}>
        <ProfileContent key={view.profile.updatedAt} view={view} />
      </Suspense>
    </FeedbackProvider>
  );
}

function ProfileContent({ view }: { view: ProfileView }) {
  const { saveProfile, state, signOut, mode, identity, cloud, cloudProfileSynced } = useAuth();
  const isCloud = mode === "cloud";
  const feedback = useFeedback();
  const [draft, setDraft] = useState<Draft>(() => toDraft(view));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const raw = useSearchParams().get("bienvenida");
  const welcome = raw !== null && /^\d+$/.test(raw) ? Number(raw) : null;
  const zones = useMemo(() => timeZones(draft.timezone), [draft.timezone]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      await saveProfile({
        fullName: draft.fullName,
        email: draft.email,
        phone: draft.phone,
        country: draft.country as ProfileView["profile"]["country"],
        region: draft.region,
        secondaryCurrency: draft.secondaryCurrency === "" || draft.secondaryCurrency === draft.preferredCurrency ? null : draft.secondaryCurrency,
        language: draft.language as ProfileView["profile"]["language"],
        dateFormat: draft.dateFormat,
        preferredCurrency: draft.preferredCurrency,
        timezone: draft.timezone,
        numberFormat: draft.numberFormat,
      });
      feedback(t.saved);
    } catch (err) {
      if (err instanceof CloudAuthError) {
        setErrors({ form: cloudErrorMessage(err) });
        return;
      }
      const fields = isAppError(err) ? err.details : [];
      const next: Record<string, string> = { form: t.saveFailed };
      if (fields.some((f) => f.startsWith("email"))) next.email = es.auth.emailInvalid;
      if (fields.some((f) => f.startsWith("phone"))) next.phone = es.errors.codes.VALIDATION_FAILED;
      if (fields.some((f) => f.startsWith("timezone"))) next.timezone = es.errors.codes.VALIDATION_FAILED;
      setErrors(next);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {welcome !== null && (
        <p role="status" className="mb-6 rounded-sm border border-gold/50 bg-gold-tint px-4 py-3 type-body-sm text-ink" data-testid="profile-welcome">
          {t.welcome(welcome)}
        </p>
      )}
      <div className="mb-6 flex flex-wrap items-center gap-4" data-testid="profile-identity">
        <span aria-hidden="true" className="grid size-14 place-items-center rounded-full bg-forest type-heading text-paper">
          {profileInitials(view.profile)}
        </span>
        <div className="min-w-0">
          <p className="type-heading text-ink" data-testid="profile-name">
            {view.profile.fullName || view.profile.username}
          </p>
          <p className="type-body-sm text-ink-2">
            {t.username}: <span className="font-semibold">{view.profile.username}</span> · {t.memberSince(formatInstant(view.profile.createdAt).split(",")[0] ?? "")}
          </p>
        </div>
      </div>
      <p className="mb-2 max-w-[48rem] type-body-sm text-ink-2">{t.lead}</p>

      <form aria-label={t.title} onSubmit={(e) => void save(e)} noValidate>
        <Section id="perfil-personal" title={t.personal} hint={t.personalHint}>
          <div className="grid items-start gap-5 tablet:grid-cols-2">
            <Field label={es.auth.fullName}>{(p) => <Input {...p} name="fullName" autoComplete="name" maxLength={80} value={draft.fullName} onChange={(e) => set("fullName", e.target.value)} />}</Field>
            {isCloud ? (
              <Field label={es.cloudAuth.profileEmail} help={es.cloudAuth.profileEmailHint}>
                {(p) => (
                  <div className="flex items-center gap-2">
                    <Input {...p} name="accountEmail" type="email" value={identity?.email ?? ""} readOnly data-testid="profile-account-email" />
                    {identity?.emailConfirmed && <span className="shrink-0 type-caption text-forest">{es.cloudAuth.profileEmailVerified}</span>}
                  </div>
                )}
              </Field>
            ) : (
              <Field label={es.auth.email} error={errors.email}>
                {(p) => <Input {...p} name="email" type="email" autoComplete="email" maxLength={120} value={draft.email} onChange={(e) => set("email", e.target.value)} />}
              </Field>
            )}
            <Field label={t.phone} error={errors.phone}>
              {(p) => <Input {...p} name="phone" type="tel" autoComplete="tel" maxLength={24} value={draft.phone} onChange={(e) => set("phone", e.target.value)} />}
            </Field>
            <Field label={t.country}>
              {(p) => (
                <Select {...p} name="country" value={draft.country} onChange={(e) => set("country", e.target.value)}>
                  <option value="">{t.noCountry}</option>
                  {PROFILE_COUNTRIES.map((c) => (
                    <option key={c} value={c}>
                      {countryName(c)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label={t.region}>{(p) => <Input {...p} name="region" autoComplete="address-level1" maxLength={60} value={draft.region} onChange={(e) => set("region", e.target.value)} />}</Field>
          </div>
        </Section>

        <Section id="perfil-financiero" title={t.financial} hint={t.financialHint}>
          <div className="grid items-start gap-5 tablet:grid-cols-2">
            <Field label={es.auth.preferredCurrency} help={es.auth.preferredCurrencyHelp}>
              {(p) => (
                <Select {...p} name="preferredCurrency" value={draft.preferredCurrency} onChange={(e) => set("preferredCurrency", e.target.value as CurrencyCode)}>
                  {CURRENCY_CODES.map((c) => (
                    <option key={c} value={c}>
                      {es.common.currencies[c]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label={t.secondaryCurrency} help={t.secondaryHelp}>
              {(p) => (
                <Select {...p} name="secondaryCurrency" value={draft.secondaryCurrency} onChange={(e) => set("secondaryCurrency", e.target.value as CurrencyCode | "")}>
                  <option value="">{t.none}</option>
                  {CURRENCY_CODES.filter((c) => c !== draft.preferredCurrency).map((c) => (
                    <option key={c} value={c}>
                      {es.common.currencies[c]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
        </Section>

        <Section id="perfil-region" title={t.regional} hint={t.regionalHint}>
          <div className="grid items-start gap-5 tablet:grid-cols-2">
            <Field label={t.language}>
              {(p) => (
                <Select {...p} name="language" value={draft.language} onChange={(e) => set("language", e.target.value)}>
                  {PROFILE_LANGUAGES.map((l) => (
                    <option key={l} value={l}>
                      {t.languages[l]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label={t.timezone} help={t.timezoneHelp} error={errors.timezone}>
              {(p) => (
                <Select {...p} name="timezone" value={draft.timezone} onChange={(e) => set("timezone", e.target.value)}>
                  {zones.map((z) => (
                    <option key={z} value={z}>
                      {z.replace(/_/g, " ")}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label={t.dateFormat}>
              {(p) => (
                <Select {...p} name="dateFormat" value={draft.dateFormat} onChange={(e) => set("dateFormat", e.target.value as DateFormat)}>
                  {DATE_FORMATS.map((f) => (
                    <option key={f} value={f}>
                      {t.dateFormats[f]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label={t.numberFormat}>
              {(p) => (
                <Select {...p} name="numberFormat" value={draft.numberFormat} onChange={(e) => set("numberFormat", e.target.value)}>
                  {Object.entries(t.numberFormats).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
          {errors.form && (
            <p role="alert" className="type-body-sm text-alert-text">
              {errors.form}
            </p>
          )}
          {isCloud && cloudProfileSynced !== null && (
            <p role="status" className="type-body-sm text-ink-2" data-testid="cloud-profile-sync">
              {cloudProfileSynced ? es.cloudAuth.profileSynced : es.cloudAuth.profileLocalOnly}
            </p>
          )}
          <div className="flex justify-end">
            <Button type="submit" variant="primary" disabled={saving} aria-busy={saving}>
              {saving ? es.common.saving : t.save}
            </Button>
          </div>
        </Section>
      </form>

      <Section id="perfil-seguridad" title={t.security} hint={isCloud ? es.cloudAuth.securityHint : t.securityHint}>
        <ChangePasswordForm username={isCloud ? (identity?.email ?? "") : view.profile.username} cloud={isCloud} />
        <div className="grid gap-3 border-t border-line pt-5">
          {state && <p className="type-body-sm text-ink-2">{t.session(state.session.remember, formatInstant(state.session.expiresAt))}</p>}
          {isCloud && <p className="type-body-sm text-ink-2">{es.cloudAuth.session}</p>}
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={() => void signOut() /* the route gate sends the user to /entrar */}
            >
              <LogOut aria-hidden="true" className="size-4" />
              {t.logout}
            </Button>
            {cloud && (
              <Button type="button" variant="ghost" onClick={() => void cloud.signOutEverywhere()}>
                {es.cloudAuth.signOutEverywhere}
              </Button>
            )}
          </div>
        </div>
      </Section>
    </>
  );
}

function ChangePasswordForm({ username, cloud = false }: { username: string; cloud?: boolean }) {
  const { changePassword } = useAuth();
  const feedback = useFeedback();
  const [values, setValues] = useState({ current: "", next: "", confirmation: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof values, v: string) => setValues((s) => ({ ...s, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const problem = checkPassword(values.next, cloud ? { minLength: CLOUD_PASSWORD_MIN_LENGTH } : { username });
    const next: Record<string, string> = {};
    if (!values.current) next.current = es.auth.required;
    if (problem) next.next = es.auth.passwordProblems[problem]!;
    else if (values.next !== values.confirmation) next.confirmation = es.auth.passwordProblems.mismatch!;
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setBusy(true);
    try {
      await changePassword(values);
      setValues({ current: "", next: "", confirmation: "" });
      feedback(t.passwordChanged);
    } catch (err) {
      if (err instanceof CloudAuthError) {
        if (err.code === "invalid-credentials") setErrors({ current: es.cloudAuth.errors["invalid-credentials"]! });
        else if (err.code === "weak-password" || err.code === "same-password") setErrors({ next: cloudErrorMessage(err) });
        else setErrors({ form: cloudErrorMessage(err) });
      } else if (isAppError(err) && err.code === "AUTH_FAILED") setErrors({ current: es.errors.codes.AUTH_FAILED });
      else if (isAppError(err) && err.code === "WEAK_PASSWORD") setErrors({ next: es.auth.passwordProblems[err.details[0] ?? ""] ?? es.errors.codes.WEAK_PASSWORD });
      else setErrors({ form: es.errors.codes.UNKNOWN });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form aria-label={t.changePassword} className="grid gap-5" onSubmit={(e) => void submit(e)} noValidate>
      <input type="text" name="username" autoComplete="username" value={username} readOnly hidden />
      <Field label={t.currentPassword} error={errors.current}>
        {(p) => <PasswordInput fieldProps={p} name="currentPassword" autoComplete="current-password" value={values.current} onChange={(v) => set("current", v)} />}
      </Field>
      <div className="grid items-start gap-5 tablet:grid-cols-2">
        <Field label={t.newPassword} help={cloud ? es.cloudAuth.passwordHelp : es.auth.passwordHelp} error={errors.next}>
          {(p) => <PasswordInput fieldProps={p} name="newPassword" autoComplete="new-password" value={values.next} onChange={(v) => set("next", v)} />}
        </Field>
        <Field label={t.confirmNewPassword} error={errors.confirmation}>
          {(p) => <PasswordInput fieldProps={p} name="confirmNewPassword" autoComplete="new-password" value={values.confirmation} onChange={(v) => set("confirmation", v)} />}
        </Field>
      </div>
      {errors.form && (
        <p role="alert" className="type-body-sm text-alert-text">
          {errors.form}
        </p>
      )}
      <div className="flex justify-end">
        <Button type="submit" variant="secondary" disabled={busy} aria-busy={busy}>
          {busy ? t.changingPassword : t.changePassword}
        </Button>
      </div>
    </form>
  );
}
