"use server";

import { headers } from "next/headers";
import { z } from "zod";
import * as authService from "@/lib/supabase/auth-service";
import type { AuthResult, AuthUser, CloudProfile } from "@/lib/supabase/auth-service";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveSiteOrigin } from "@/lib/supabase/site-url";
import { CONFIRM_PATH } from "./paths";

/**
 * Server Actions for Supabase Auth (Step 14, D-SB-02). The only door from the interface to
 * Supabase Auth: every call runs on the server with the HttpOnly session cookies, so no token
 * ever reaches browser JavaScript. Next.js checks the Origin of every Server Action (CSRF).
 *
 * Inputs arrive from the network: they are shape-checked here and validated in the service.
 * Results carry only safe codes (no provider message, no token, no stack).
 */

const text = (max: number) => z.string().max(max);
const NOT_CONFIGURED = { ok: false, code: "unknown" } as const;
const INVALID = { ok: false, code: "invalid-input" } as const;

async function client() {
  return createSupabaseServerClient();
}

async function linkTarget(): Promise<string | null> {
  const origin = resolveSiteOrigin(await headers());
  return origin ? `${origin}${CONFIRM_PATH}` : null;
}

export async function cloudSignIn(raw: unknown): Promise<AuthResult<{ user: AuthUser }>> {
  const input = z.object({ email: text(320), password: text(1024) }).safeParse(raw);
  if (!input.success) return { ok: false, code: "invalid-credentials" };
  const c = await client();
  if (!c) return NOT_CONFIGURED;
  return authService.signInWithEmail(c, input.data);
}

export async function cloudSignUp(raw: unknown): Promise<AuthResult<{ needsVerification: boolean }>> {
  const input = z
    .object({ email: text(320), password: text(1024), confirmation: text(1024), fullName: text(200).optional(), preferredCurrency: text(8).optional() })
    .safeParse(raw);
  if (!input.success) return INVALID;
  const [c, redirectTo] = [await client(), await linkTarget()];
  if (!c || !redirectTo) return NOT_CONFIGURED;
  return authService.signUpWithEmail(c, { ...input.data, redirectTo });
}

export async function cloudSignOut(raw: unknown): Promise<AuthResult> {
  const scope = z.enum(["local", "global"]).catch("local").parse(raw);
  const c = await client();
  if (!c) return NOT_CONFIGURED;
  return authService.signOutSession(c, scope);
}

export async function cloudRequestReset(raw: unknown): Promise<AuthResult> {
  const input = z.object({ email: text(320) }).safeParse(raw);
  if (!input.success) return INVALID;
  const [c, redirectTo] = [await client(), await linkTarget()];
  if (!c || !redirectTo) return NOT_CONFIGURED;
  return authService.requestPasswordReset(c, { email: input.data.email, redirectTo });
}

export async function cloudResendVerification(raw: unknown): Promise<AuthResult> {
  const input = z.object({ email: text(320) }).safeParse(raw);
  if (!input.success) return INVALID;
  const [c, redirectTo] = [await client(), await linkTarget()];
  if (!c || !redirectTo) return NOT_CONFIGURED;
  return authService.resendVerification(c, { email: input.data.email, redirectTo });
}

export async function cloudChangePassword(raw: unknown): Promise<AuthResult> {
  const input = z.object({ currentPassword: text(1024).optional(), newPassword: text(1024), confirmation: text(1024) }).safeParse(raw);
  if (!input.success) return INVALID;
  const c = await client();
  if (!c) return NOT_CONFIGURED;
  return authService.changePassword(c, input.data);
}

export async function cloudGetProfile(): Promise<AuthResult<{ profile: CloudProfile }>> {
  const c = await client();
  if (!c) return NOT_CONFIGURED;
  const user = await authService.getAuthenticatedUser(c);
  if (!user) return { ok: false, code: "session-missing" };
  return authService.getCloudProfile(c, user.id);
}

/** Saves the editable profile fields in public.profiles (own row only; needs SQL 09). */
export async function cloudUpdateProfile(raw: unknown): Promise<AuthResult<{ profile: CloudProfile }>> {
  const c = await client();
  if (!c) return NOT_CONFIGURED;
  const user = await authService.getAuthenticatedUser(c);
  if (!user) return { ok: false, code: "session-missing" };
  return authService.updateCloudProfile(c, user.id, raw);
}
