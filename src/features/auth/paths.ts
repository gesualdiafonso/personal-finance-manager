/** Auth routes and the safe "return to" rule, shared by server and client code (Step 14). */
export const LOGIN_PATH = "/entrar";
export const REGISTER_PATH = "/registro";
export const RECOVER_PATH = "/recuperar";
export const RESET_PATH = "/restablecer";
export const VERIFY_PATH = "/verificar";
export const CONFIRM_PATH = "/auth/confirm";

const AUTH_PREFIXES = [LOGIN_PATH, REGISTER_PATH, RECOVER_PATH, RESET_PATH, VERIFY_PATH, "/auth/"];

/** Where to go back after signing in: only paths of this app, never another origin or an auth screen. */
export function safeNext(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\") || raw.includes("\\")) return "/";
  if (AUTH_PREFIXES.some((p) => raw === p || raw.startsWith(p.endsWith("/") ? p : `${p}/`) || raw.startsWith(`${p}?`))) return "/";
  return raw;
}
