/**
 * FICTITIOUS Supabase values for tests (EJEMPLO-FICTICIO). Keys are assembled at runtime so no
 * literal in the repository looks like a real credential to a secret scanner; none of them is
 * valid for any Supabase project.
 */
const b64url = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
const fakeJwt = (role: string) => [b64url({ alg: "HS256", typ: "JWT" }), b64url({ iss: "supabase", ref: "ejemploficticio", role, iat: 1700000000, exp: 2000000000 }), "EJEMPLOfirmaFicticiaNoValida0123456789"].join(".");

export const FAKE = {
  url: "https://ejemploficticio.supabase.example",
  publishableKey: ["sb", "publishable", "EJEMPLOficticioNoValido0123456789"].join("_"),
  secretKey: ["sb", "secret", "EJEMPLOficticioNoValido0123456789"].join("_"),
  legacyAnonKey: fakeJwt("anon"),
  serviceRoleKey: fakeJwt("service_role"),
};

export const configuredEnv = {
  NEXT_PUBLIC_SUPABASE_URL: FAKE.url,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: FAKE.publishableKey,
};
