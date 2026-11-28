"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { CURRENCY_CODES, type CurrencyCode } from "@/domain/currency";
import { isAppError } from "@/lib/errors/app-error";
import { es } from "@/lib/i18n/es";
import { checkPassword, CLOUD_PASSWORD_MIN_LENGTH } from "@/services/auth/password";
import { CloudAuthError, useAuth } from "./auth-state";
import { AuthFrame, AuthSplash, nextFromUrl, PasswordInput, useLeaveWhenSignedIn } from "./auth-ui";
import { LOGIN_PATH, RECOVER_PATH, REGISTER_PATH, VERIFY_PATH } from "./paths";

/**
 * Supabase Auth screens (Step 14, cloud mode). Every action goes through `useAuth().cloud`
 * (Server Actions); no screen talks to Supabase. Messages never say whether an email exists.
 */
const t = es.auth;
const c = es.cloudAuth;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** The address waiting for verification, kept for this tab only (not in the URL). */
export const PENDING_EMAIL_KEY = "aureon.pending-email";
const RESEND_COOLDOWN_S = 60;

export function cloudErrorMessage(error: unknown): string {
  if (error instanceof CloudAuthError) return c.errors[error.code] ?? c.errors.unknown!;
  if (isAppError(error)) {
    if (error.code === "AUTH_LOCKED") return t.lockedFor(Number(error.details[0] ?? 30));
    return es.errors.codes[error.code];
  }
  return c.errors.unknown!;
}

function cloudPasswordProblem(password: string, confirmation?: string): string | null {
  const problem = checkPassword(password, { confirmation, minLength: CLOUD_PASSWORD_MIN_LENGTH });
  if (!problem) return null;
  if (problem === "too-short") return c.passwordHelp;
  return t.passwordProblems[problem] ?? c.errors["weak-password"]!;
}

function setPendingEmail(email: string | null) {
  try {
    if (email) window.sessionStorage.setItem(PENDING_EMAIL_KEY, email);
    else window.sessionStorage.removeItem(PENDING_EMAIL_KEY);
  } catch {
    // Storage blocked: the screen asks for the address again.
  }
}
function getPendingEmail(): string {
  try {
    return window.sessionStorage.getItem(PENDING_EMAIL_KEY) ?? "";
  } catch {
    return "";
  }
}

function Notice({ children, tone = "neutral", testId }: { children: ReactNode; tone?: "neutral" | "alert"; testId?: string }) {
  return (
    <p role={tone === "alert" ? "alert" : "status"} data-testid={testId} className={tone === "alert" ? "type-body-sm text-alert-text" : "rounded-sm bg-paper-2 px-3 py-2 type-body-sm text-ink-2"}>
      {children}
    </p>
  );
}

function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="font-semibold text-lake underline-offset-4 hover:underline">
      {children}
    </Link>
  );
}

/** Cooldown button to request another verification email. */
function ResendButton({ email }: { email: string }) {
  const { cloud } = useAuth();
  const [wait, setWait] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; alert: boolean } | null>(null);
  useEffect(() => {
    if (wait <= 0) return;
    const id = window.setTimeout(() => setWait((w) => w - 1), 1000);
    return () => window.clearTimeout(id);
  }, [wait]);
  async function resend() {
    if (!cloud || !EMAIL_PATTERN.test(email.trim())) {
      setMessage({ text: c.errors["invalid-input"]!, alert: true });
      return;
    }
    setBusy(true);
    try {
      await cloud.resendVerification(email.trim());
      setMessage({ text: c.resent, alert: false });
      setWait(RESEND_COOLDOWN_S);
    } catch (err) {
      setMessage({ text: cloudErrorMessage(err), alert: true });
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="grid gap-2">
      <Button type="button" variant="secondary" onClick={() => void resend()} disabled={busy || wait > 0} aria-busy={busy}>
        {busy ? c.resending : c.resend}
      </Button>
      {wait > 0 && <p className="type-caption text-ink-2">{c.resendWait(wait)}</p>}
      {message && <Notice tone={message.alert ? "alert" : "neutral"}>{message.text}</Notice>}
    </div>
  );
}

export function CloudLoginScreen() {
  const { cloud, endedReason, offline, localAccountHint } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const ownSubmit = useRef(false);
  const status = useLeaveWhenSignedIn(nextFromUrl, ownSubmit);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  if (status !== "signed-out") return <AuthSplash />;

  const reason = params.get("motivo");
  const reasonText = reason ? c.reasons[reason] : endedReason === "expired" ? c.reasons.expired : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError(new CloudAuthError("invalid-input"));
      return;
    }
    setBusy(true);
    setError(null);
    ownSubmit.current = true;
    try {
      await cloud!.signIn({ email: email.trim(), password });
      router.replace(nextFromUrl());
    } catch (err) {
      ownSubmit.current = false;
      setError(err);
      setPassword("");
    } finally {
      setBusy(false);
    }
  }

  const notConfirmed = error instanceof CloudAuthError && error.code === "email-not-confirmed";
  return (
    <AuthFrame
      title={t.loginTitle}
      lead={c.loginLead}
      note={c.note}
      footer={
        <>
          <p className="type-body-sm text-ink-2">
            <TextLink href={RECOVER_PATH}>{c.forgot}</TextLink>
          </p>
          <p className="type-body-sm text-ink-2">
            {t.noAccount} <TextLink href={REGISTER_PATH}>{t.createAccount}</TextLink>
          </p>
        </>
      }
    >
      <form aria-label={t.loginTitle} className="grid gap-5" onSubmit={(e) => void submit(e)} noValidate>
        {params.get("verificado") && <Notice testId="email-verified">{c.verified}</Notice>}
        {reasonText && <Notice testId="login-reason">{reasonText}</Notice>}
        {offline && <Notice>{c.offlineLogin}</Notice>}
        {localAccountHint && <Notice testId="local-account-hint">{c.localHint(localAccountHint)}</Notice>}
        <Field label={c.email}>
          {(p) => <Input {...p} name="email" type="email" autoComplete="email" autoCapitalize="off" spellCheck={false} maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} />}
        </Field>
        <Field label={t.password}>{(p) => <PasswordInput fieldProps={p} name="password" autoComplete="current-password" value={password} onChange={setPassword} />}</Field>
        {error !== null && <Notice tone="alert">{cloudErrorMessage(error)}</Notice>}
        {notConfirmed && <ResendButton email={email} />}
        <Button type="submit" variant="primary" disabled={busy} aria-busy={busy} className="w-full">
          {busy ? t.submittingLogin : t.submitLogin}
        </Button>
      </form>
    </AuthFrame>
  );
}

type RegisterField = "fullName" | "email" | "password" | "confirmation";

export function CloudRegisterScreen() {
  const { cloud, localAccountHint } = useAuth();
  const router = useRouter();
  const ownSubmit = useRef(false);
  const status = useLeaveWhenSignedIn(() => "/perfil", ownSubmit);
  const [values, setValues] = useState({ fullName: "", email: "", password: "", confirmation: "" });
  const [currency, setCurrency] = useState<CurrencyCode>("ARS");
  const [errors, setErrors] = useState<Partial<Record<RegisterField | "form", string>>>({});
  const [busy, setBusy] = useState(false);
  if (status !== "signed-out") return <AuthSplash />;

  const set = (k: RegisterField, v: string) => setValues((s) => ({ ...s, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const next: typeof errors = {};
    const email = values.email.trim();
    if (!EMAIL_PATTERN.test(email)) next.email = c.errors["invalid-input"];
    const problem = cloudPasswordProblem(values.password);
    if (problem) next.password = problem;
    else if (values.confirmation !== values.password) next.confirmation = t.passwordProblems.mismatch;
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setBusy(true);
    ownSubmit.current = true;
    try {
      const result = await cloud!.signUp({ ...values, email, preferredCurrency: currency });
      if (result.needsVerification) {
        setPendingEmail(email);
        router.replace(VERIFY_PATH);
      } else router.replace("/perfil");
    } catch (err) {
      ownSubmit.current = false;
      setErrors({ form: cloudErrorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthFrame
      title={t.registerTitle}
      lead={c.registerLead}
      note={c.note}
      footer={
        <p className="type-body-sm text-ink-2">
          {t.haveAccount} <TextLink href={LOGIN_PATH}>{t.goLogin}</TextLink>
        </p>
      }
    >
      <form aria-label={t.registerTitle} className="grid gap-5" onSubmit={(e) => void submit(e)} noValidate>
        {localAccountHint && <Notice testId="local-account-hint">{c.localHint(localAccountHint)}</Notice>}
        <Field label={t.fullName} error={errors.fullName}>
          {(p) => <Input {...p} name="fullName" autoComplete="name" maxLength={80} value={values.fullName} onChange={(e) => set("fullName", e.target.value)} />}
        </Field>
        <Field label={c.email} error={errors.email}>
          {(p) => <Input {...p} name="email" type="email" autoComplete="email" autoCapitalize="off" spellCheck={false} maxLength={254} value={values.email} onChange={(e) => set("email", e.target.value)} />}
        </Field>
        <Field label={t.password} help={c.passwordHelp} error={errors.password}>
          {(p) => <PasswordInput fieldProps={p} name="password" autoComplete="new-password" value={values.password} onChange={(v) => set("password", v)} />}
        </Field>
        <Field label={t.confirmPassword} error={errors.confirmation}>
          {(p) => <PasswordInput fieldProps={p} name="confirmation" autoComplete="new-password" value={values.confirmation} onChange={(v) => set("confirmation", v)} />}
        </Field>
        <Field label={t.preferredCurrency} help={t.preferredCurrencyHelp}>
          {(p) => (
            <Select {...p} name="preferredCurrency" value={currency} onChange={(e) => setCurrency(e.target.value as CurrencyCode)}>
              {CURRENCY_CODES.map((code) => (
                <option key={code} value={code}>
                  {es.common.currencies[code]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {errors.form && <Notice tone="alert">{errors.form}</Notice>}
        <Button type="submit" variant="primary" disabled={busy} aria-busy={busy} className="w-full">
          {busy ? t.submittingRegister : t.submitRegister}
        </Button>
      </form>
    </AuthFrame>
  );
}

/** /verificar — "check your inbox" after registering, with a resend button. */
const noSubscription = () => () => undefined;

export function VerifyEmailScreen() {
  // The pending address is read after hydration (server snapshot ""), then the field is editable.
  const pending = useSyncExternalStore(noSubscription, getPendingEmail, () => "");
  const [typed, setEmail] = useState<string | null>(null);
  const email = typed ?? pending;
  return (
    <AuthFrame
      title={c.verifyTitle}
      lead={c.verifyLead}
      note={c.note}
      footer={
        <p className="type-body-sm text-ink-2">
          <TextLink href={LOGIN_PATH}>{t.goLogin}</TextLink>
        </p>
      }
    >
      <div className="grid gap-4" data-testid="verify-email">
        <Field label={c.email}>
          {(p) => <Input {...p} name="email" type="email" autoComplete="email" maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} />}
        </Field>
        <p className="type-body-sm text-ink-2">{c.verifySpam}</p>
        <ResendButton email={email} />
      </div>
    </AuthFrame>
  );
}

/** Shown inside the app when the signed-in identity has no verified email (Confirm email off). */
export function VerificationPendingScreen() {
  const { identity, signOut } = useAuth();
  return (
    <AuthFrame title={c.verifyTitle} lead={c.verifyPendingLead} note={c.note} footer={null}>
      <div className="grid gap-4" data-testid="verification-pending">
        {identity && <p className="type-body text-ink">{c.verifyFor(identity.email)}</p>}
        <ResendButton email={identity?.email ?? ""} />
        <Button type="button" variant="ghost" onClick={() => void signOut()}>
          {es.profile.logout}
        </Button>
      </div>
    </AuthFrame>
  );
}

/** /recuperar — request a recovery link (same answer whether the email exists or not). */
export function RecoverScreen() {
  const { cloud, mode } = useAuth();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!EMAIL_PATTERN.test(email.trim())) {
      setError(c.errors["invalid-input"]!);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await cloud!.requestReset(email.trim());
      setSent(true);
    } catch (err) {
      setError(cloudErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthFrame
      title={c.recoverTitle}
      lead={mode === "cloud" ? c.recoverLead : t.localNote}
      note={mode === "cloud" ? c.note : t.localNote}
      footer={
        <p className="type-body-sm text-ink-2">
          <TextLink href={LOGIN_PATH}>{t.goLogin}</TextLink>
        </p>
      }
    >
      {mode !== "cloud" ? null : sent ? (
        <Notice testId="recover-sent">{c.recoverSent}</Notice>
      ) : (
        <form aria-label={c.recoverTitle} className="grid gap-5" onSubmit={(e) => void submit(e)} noValidate>
          <Field label={c.email}>
            {(p) => <Input {...p} name="email" type="email" autoComplete="email" maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} />}
          </Field>
          {error && <Notice tone="alert">{error}</Notice>}
          <Button type="submit" variant="primary" disabled={busy} aria-busy={busy} className="w-full">
            {c.recoverSubmit}
          </Button>
        </form>
      )}
    </AuthFrame>
  );
}

/** /restablecer — set a new password with the recovery session opened by the email link. */
export function ResetPasswordScreen() {
  const { cloud, status, mode } = useAuth();
  const router = useRouter();
  const [values, setValues] = useState({ password: "", confirmation: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (status === "loading") return <AuthSplash />;
  const hasSession = mode === "cloud" && status !== "signed-out";

  async function submit(e: FormEvent) {
    e.preventDefault();
    const problem = cloudPasswordProblem(values.password, values.confirmation);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await cloud!.completeReset({ newPassword: values.password, confirmation: values.confirmation });
      router.replace("/?restablecida=1");
    } catch (err) {
      setError(cloudErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthFrame
      title={c.resetTitle}
      lead={c.resetLead}
      note={c.note}
      footer={
        <p className="type-body-sm text-ink-2">
          <TextLink href={RECOVER_PATH}>{c.requestNewLink}</TextLink>
        </p>
      }
    >
      {!hasSession ? (
        <Notice testId="reset-no-session">{c.resetNoSession}</Notice>
      ) : (
        <form aria-label={c.resetTitle} className="grid gap-5" onSubmit={(e) => void submit(e)} noValidate>
          <Field label={es.profile.newPassword} help={c.passwordHelp}>
            {(p) => <PasswordInput fieldProps={p} name="password" autoComplete="new-password" value={values.password} onChange={(v) => setValues((s) => ({ ...s, password: v }))} />}
          </Field>
          <Field label={es.profile.confirmNewPassword}>
            {(p) => <PasswordInput fieldProps={p} name="confirmation" autoComplete="new-password" value={values.confirmation} onChange={(v) => setValues((s) => ({ ...s, confirmation: v }))} />}
          </Field>
          {error && <Notice tone="alert">{error}</Notice>}
          <Button type="submit" variant="primary" disabled={busy} aria-busy={busy} className="w-full">
            {c.resetSubmit}
          </Button>
        </form>
      )}
    </AuthFrame>
  );
}

/**
 * Shown instead of the app while this browser's existing data is not linked to the identity
 * (status "needs-link"). Nothing is linked without the user's action; nothing is deleted.
 */
export function LinkLocalDataScreen() {
  const { cloud, identity, linkSummary, signOut } = useAuth();
  const [username, setUsername] = useState(linkSummary?.localUsername ?? "");
  const [password, setPassword] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!linkSummary || !identity || !cloud) return <AuthSplash />;
  const hasAccount = linkSummary.localUsername !== null;

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(cloudErrorMessage(err));
      setPassword("");
    } finally {
      setBusy(false);
    }
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!confirmed || (hasAccount && (!username.trim() || !password))) {
      setError(t.required);
      return;
    }
    void run(() => (hasAccount ? cloud!.migrateLocalAccount({ username, password }) : cloud!.linkUnclaimedData()));
  }

  return (
    <AuthFrame
      title={c.linkTitle}
      lead={c.linkLead(identity.email)}
      note={c.linkAfter}
      footer={
        <Button type="button" variant="ghost" onClick={() => void signOut()}>
          {es.profile.logout}
        </Button>
      }
    >
      <div className="grid gap-6" data-testid="link-local-data">
        <p className="type-body text-ink">{c.linkCount(linkSummary.recordCount)}</p>
        {linkSummary.interrupted && <Notice testId="link-interrupted">{c.linkInterrupted}</Notice>}
        <form aria-label={c.linkTitle} className="grid gap-5" onSubmit={submit} noValidate>
          {hasAccount ? (
            <>
              <p className="type-body-sm text-ink-2">{c.linkAccountIntro(linkSummary.localUsername!)}</p>
              <Field label={c.linkLocalUsername}>
                {(p) => <Input {...p} name="localUsername" autoComplete="username" autoCapitalize="off" spellCheck={false} value={username} onChange={(e) => setUsername(e.target.value)} />}
              </Field>
              <Field label={c.linkLocalPassword}>{(p) => <PasswordInput fieldProps={p} name="localPassword" autoComplete="current-password" value={password} onChange={setPassword} />}</Field>
            </>
          ) : (
            <p className="type-body-sm text-ink-2">{c.linkNoAccount}</p>
          )}
          <label className="flex items-start gap-2.5 type-body-sm">
            <input type="checkbox" name="confirmLink" className="mt-0.5 size-4 accent-forest" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
            <span>{c.linkConfirm}</span>
          </label>
          {error && <Notice tone="alert">{error}</Notice>}
          <Button type="submit" variant="primary" disabled={busy} aria-busy={busy} className="w-full">
            {busy ? c.linking : c.linkSubmit}
          </Button>
        </form>
        <div className="grid gap-2 border-t border-line pt-5">
          <Button type="button" variant="secondary" disabled={busy} onClick={() => void run(() => cloud!.startSeparate())}>
            {c.linkSeparate}
          </Button>
          <p className="type-caption text-ink-2">{c.linkSeparateHelp}</p>
        </div>
      </div>
    </AuthFrame>
  );
}
