"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { AureonLogo } from "@/components/brand/aureon-logo";
import { ThemeToggle } from "@/components/brand/brand-controls";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { CURRENCY_CODES, type CurrencyCode } from "@/domain/currency";
import { normalizeUsername, usernameSchema } from "@/domain/profile";
import { isAppError } from "@/lib/errors/app-error";
import { es } from "@/lib/i18n/es";
import { checkPassword } from "@/services/auth/password";
import { useAuth } from "./auth-context";
import { AuthSplash, LOGIN_PATH, REGISTER_PATH, safeNext } from "./auth-gate";

const t = es.auth;

function nextFromUrl(): string {
  if (typeof window === "undefined") return "/";
  return safeNext(new URLSearchParams(window.location.search).get("next"));
}

/** Brand frame of the two account screens: logo, title, one card, the local-account note. */
function AuthFrame({ title, lead, children, footer }: { title: string; lead: string; children: ReactNode; footer: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      <header className="flex items-center justify-between px-5 pt-5 tablet:px-10 tablet:pt-8">
        <AureonLogo className="h-7 w-auto" />
        <ThemeToggle />
      </header>
      <main id="contenido" className="mx-auto grid w-full max-w-[28rem] flex-1 content-center gap-8 px-5 py-10">
        <div className="grid gap-3">
          <span className="brand-rule" aria-hidden="true" />
          <h1 className="type-title-page-mobile tablet:type-title-page">{title}</h1>
          <p className="type-body text-ink-2">{lead}</p>
        </div>
        <div className="rounded-sm border border-line bg-surface p-5 tablet:p-6">{children}</div>
        <div className="grid gap-4 text-center">{footer}</div>
        <p className="type-caption text-ink-3">{t.localNote}</p>
      </main>
    </div>
  );
}

/** Password input with a show/hide switch (the value never leaves the field). */
export function PasswordInput({
  value,
  onChange,
  autoComplete,
  name,
  fieldProps,
}: {
  value: string;
  onChange: (v: string) => void;
  autoComplete: "current-password" | "new-password";
  name: string;
  fieldProps: { id: string; "aria-invalid": boolean; "aria-describedby": string | undefined };
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input
        {...fieldProps}
        name={name}
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        autoCapitalize="off"
        spellCheck={false}
        className="pr-12"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? t.hide : t.show}
        aria-pressed={visible}
        title={visible ? t.hide : t.show}
        className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-sm text-ink-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-focus-ring"
      >
        {visible ? <EyeOff aria-hidden="true" className="size-4.5" /> : <Eye aria-hidden="true" className="size-4.5" />}
      </button>
    </div>
  );
}

function RememberCheckbox({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-2.5 type-body-sm">
      <input type="checkbox" name="remember" className="mt-0.5 size-4 accent-forest" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        {t.remember}
        <span className="block type-caption text-ink-2">{t.rememberHelp}</span>
      </span>
    </label>
  );
}

function errorMessage(error: unknown): string {
  if (isAppError(error)) {
    if (error.code === "AUTH_LOCKED") return t.lockedFor(Number(error.details[0] ?? 30));
    if (error.code === "WEAK_PASSWORD") return t.passwordProblems[error.details[0] ?? ""] ?? es.errors.codes.WEAK_PASSWORD;
    return es.errors.codes[error.code];
  }
  return es.errors.codes.UNKNOWN;
}

/**
 * Redirects a user who arrives here already signed in. `ownSubmit` is set by the screen's own
 * form, which then redirects itself (with its own destination).
 */
function useLeaveWhenSignedIn(target: () => string, ownSubmit: { current: boolean }) {
  const { status } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (status === "signed-in" && !ownSubmit.current) router.replace(target());
  }, [status, router, target, ownSubmit]);
  return status;
}

const toProfile = () => "/perfil";

export function LoginScreen() {
  const { signIn, hasAccount, endedReason } = useAuth();
  const router = useRouter();
  const ownSubmit = useRef(false);
  const status = useLeaveWhenSignedIn(nextFromUrl, ownSubmit);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (status !== "signed-out") return <AuthSplash />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError(t.required);
      return;
    }
    setBusy(true);
    setError(null);
    ownSubmit.current = true;
    try {
      await signIn({ username, password, remember });
      router.replace(nextFromUrl());
    } catch (err) {
      ownSubmit.current = false;
      setError(errorMessage(err));
      setPassword("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthFrame
      title={t.loginTitle}
      lead={t.loginLead}
      footer={
        <p className="type-body-sm text-ink-2">
          {t.noAccount}{" "}
          <Link href={REGISTER_PATH} className="font-semibold text-lake underline-offset-4 hover:underline">
            {t.createAccount}
          </Link>
        </p>
      }
    >
      <form aria-label={t.loginTitle} className="grid gap-5" onSubmit={(e) => void submit(e)} noValidate>
        {!hasAccount && (
          <p role="status" className="rounded-sm bg-paper-2 px-3 py-2 type-body-sm text-ink-2" data-testid="no-local-account">
            {t.noLocalAccount}{" "}
            <Link href={REGISTER_PATH} className="font-semibold text-lake underline-offset-4 hover:underline">
              {t.createAccount}
            </Link>
          </p>
        )}
        {endedReason === "expired" && (
          <p role="status" className="rounded-sm bg-paper-2 px-3 py-2 type-body-sm text-ink-2">
            {t.sessionEnded}
          </p>
        )}
        <Field label={t.username}>
          {(p) => <Input {...p} name="username" autoComplete="username" autoCapitalize="off" spellCheck={false} value={username} onChange={(e) => setUsername(e.target.value)} />}
        </Field>
        <Field label={t.password}>{(p) => <PasswordInput fieldProps={p} name="password" autoComplete="current-password" value={password} onChange={setPassword} />}</Field>
        <RememberCheckbox checked={remember} onChange={setRemember} />
        {error && (
          <p role="alert" className="type-body-sm text-alert-text">
            {error}
          </p>
        )}
        <Button type="submit" variant="primary" disabled={busy} aria-busy={busy} className="w-full">
          {busy ? t.submittingLogin : t.submitLogin}
        </Button>
      </form>
    </AuthFrame>
  );
}

type RegisterField = "fullName" | "username" | "email" | "password" | "confirmation";

export function RegisterScreen() {
  const { signUp, hasAccount } = useAuth();
  const router = useRouter();
  const ownSubmit = useRef(false);
  const status = useLeaveWhenSignedIn(toProfile, ownSubmit);
  const [values, setValues] = useState({ fullName: "", username: "", email: "", password: "", confirmation: "" });
  const [currency, setCurrency] = useState<CurrencyCode>("ARS");
  const [remember, setRemember] = useState(true);
  const [errors, setErrors] = useState<Partial<Record<RegisterField | "form", string>>>({});
  const [busy, setBusy] = useState(false);
  if (status !== "signed-out") return <AuthSplash />;

  const set = (k: RegisterField, v: string) => setValues((s) => ({ ...s, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const next: typeof errors = {};
    const username = normalizeUsername(values.username);
    if (!usernameSchema.safeParse(username).success) next.username = t.usernameInvalid;
    if (values.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) next.email = t.emailInvalid;
    const problem = checkPassword(values.password, { username });
    if (problem) next.password = t.passwordProblems[problem];
    else if (values.confirmation !== values.password) next.confirmation = t.passwordProblems.mismatch;
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setBusy(true);
    ownSubmit.current = true;
    try {
      const result = await signUp({ ...values, username, preferredCurrency: currency, remember });
      router.replace(`/perfil?bienvenida=${result.preservedRecords}`);
    } catch (err) {
      ownSubmit.current = false;
      if (isAppError(err) && err.code === "USERNAME_TAKEN") setErrors({ username: errorMessage(err) });
      else setErrors({ form: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthFrame
      title={t.registerTitle}
      lead={t.registerLead}
      footer={
        <p className="type-body-sm text-ink-2">
          {t.haveAccount}{" "}
          <Link href={LOGIN_PATH} className="font-semibold text-lake underline-offset-4 hover:underline">
            {t.goLogin}
          </Link>
        </p>
      }
    >
      {hasAccount ? (
        <div className="grid gap-4">
          <p className="type-body text-ink">{t.accountExists}</p>
          <Button type="button" variant="primary" onClick={() => router.replace(LOGIN_PATH)}>
            {t.goLogin}
          </Button>
        </div>
      ) : (
        <form aria-label={t.registerTitle} className="grid gap-5" onSubmit={(e) => void submit(e)} noValidate>
          <Field label={t.fullName} error={errors.fullName}>
            {(p) => <Input {...p} name="fullName" autoComplete="name" maxLength={80} value={values.fullName} onChange={(e) => set("fullName", e.target.value)} />}
          </Field>
          <Field label={t.username} help={t.usernameHelp} error={errors.username}>
            {(p) => <Input {...p} name="username" autoComplete="username" autoCapitalize="off" spellCheck={false} maxLength={32} value={values.username} onChange={(e) => set("username", e.target.value)} />}
          </Field>
          <Field label={t.email} error={errors.email}>
            {(p) => <Input {...p} name="email" type="email" autoComplete="email" maxLength={120} value={values.email} onChange={(e) => set("email", e.target.value)} />}
          </Field>
          <Field label={t.password} help={t.passwordHelp} error={errors.password}>
            {(p) => <PasswordInput fieldProps={p} name="password" autoComplete="new-password" value={values.password} onChange={(v) => set("password", v)} />}
          </Field>
          <Field label={t.confirmPassword} error={errors.confirmation}>
            {(p) => <PasswordInput fieldProps={p} name="confirmation" autoComplete="new-password" value={values.confirmation} onChange={(v) => set("confirmation", v)} />}
          </Field>
          <Field label={t.preferredCurrency} help={t.preferredCurrencyHelp}>
            {(p) => (
              <Select {...p} name="preferredCurrency" value={currency} onChange={(e) => setCurrency(e.target.value as CurrencyCode)}>
                {CURRENCY_CODES.map((c) => (
                  <option key={c} value={c}>
                    {es.common.currencies[c]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <RememberCheckbox checked={remember} onChange={setRemember} />
          {errors.form && (
            <p role="alert" className="type-body-sm text-alert-text">
              {errors.form}
            </p>
          )}
          <Button type="submit" variant="primary" disabled={busy} aria-busy={busy} className="w-full">
            {busy ? t.submittingRegister : t.submitRegister}
          </Button>
        </form>
      )}
    </AuthFrame>
  );
}
