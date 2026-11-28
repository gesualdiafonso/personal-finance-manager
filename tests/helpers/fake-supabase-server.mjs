// FAKE Supabase Auth (GoTrue) + minimal PostgREST `profiles` — TESTS ONLY (Step 14).
//
// Speaks the subset of the real HTTP API that @supabase/supabase-js calls for email/password
// auth, so the application code runs UNCHANGED against it (real @supabase/ssr, real cookies).
// It is never bundled, never deployed and holds only fictitious users (EJEMPLO-FICTICIO).
// The JWT secret is generated at random on every start: nothing here is a credential.
//
// Test-control endpoints (prefix /__test): outbox of emails, expire/revoke sessions, toggles.
//
// Usage: `node tests/helpers/fake-supabase-server.mjs <port>` (E2E) or startFakeSupabase() (Vitest).
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:http";

const b64url = (v) => Buffer.from(typeof v === "string" ? v : JSON.stringify(v)).toString("base64url");

export function createFakeSupabase() {
  const secret = randomBytes(32);
  const state = {
    users: new Map(), // email -> user
    sessions: new Map(), // sessionId -> { userId, revoked, amr }
    refresh: new Map(), // refresh token -> sessionId
    tokens: new Map(), // token_hash -> { email, type, used, expiresAt }
    outbox: [], // { to, type, tokenHash, redirectTo }
    profiles: new Map(), // userId -> row
    profilesPolicies: true, // false simulates "SQL 09 not applied" (permission denied)
    accessTtl: 3600,
    requests: [], // { method, path } — to assert what reached the "server"
    authDown: false, // simulate an unreachable Auth server (503)
  };

  const now = () => Math.floor(Date.now() / 1000);

  function sign(payload) {
    const head = b64url({ alg: "HS256", typ: "JWT" });
    const body = b64url(payload);
    const sig = createHmac("sha256", secret).update(`${head}.${body}`).digest("base64url");
    return `${head}.${body}.${sig}`;
  }
  function verify(token) {
    const parts = String(token ?? "").split(".");
    if (parts.length !== 3) return null;
    const sig = createHmac("sha256", secret).update(`${parts[0]}.${parts[1]}`).digest("base64url");
    if (sig !== parts[2]) return null;
    try {
      return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    } catch {
      return null;
    }
  }

  function publicUser(u) {
    return {
      id: u.id,
      aud: "authenticated",
      role: "authenticated",
      email: u.email,
      email_confirmed_at: u.confirmedAt,
      confirmed_at: u.confirmedAt,
      user_metadata: u.meta,
      app_metadata: { provider: "email", providers: ["email"] },
      identities: [],
      created_at: u.createdAt,
      updated_at: u.createdAt,
    };
  }

  function issueSession(user, method) {
    const sessionId = randomUUID();
    state.sessions.set(sessionId, { userId: user.id, revoked: false, amr: [{ method, timestamp: now() }] });
    return tokensFor(user, sessionId);
  }
  function tokensFor(user, sessionId) {
    const s = state.sessions.get(sessionId);
    const iat = now();
    const exp = iat + state.accessTtl;
    const access = sign({ sub: user.id, email: user.email, aud: "authenticated", role: "authenticated", iat, exp, session_id: sessionId, amr: s.amr, aal: "aal1", is_anonymous: false });
    const refresh = randomBytes(18).toString("base64url");
    state.refresh.set(refresh, sessionId);
    return { access_token: access, token_type: "bearer", expires_in: state.accessTtl, expires_at: exp, refresh_token: refresh, user: publicUser(user) };
  }

  function userById(id) {
    for (const u of state.users.values()) if (u.id === id) return u;
    return null;
  }

  /** The user behind a Bearer token, or an error tuple. */
  function authenticate(req) {
    const h = req.headers.authorization ?? "";
    const claims = verify(h.replace(/^Bearer\s+/i, ""));
    if (!claims) return [403, { code: "bad_jwt", message: "invalid JWT" }];
    if (claims.exp <= now()) return [403, { code: "bad_jwt", message: "token is expired" }];
    const s = state.sessions.get(claims.session_id);
    if (!s || s.revoked) return [403, { code: "session_not_found", message: "Session from session_id claim in JWT does not exist" }];
    const user = userById(claims.sub);
    if (!user) return [403, { code: "user_not_found", message: "User not found" }];
    return [null, user, claims];
  }

  function mail(to, type, redirectTo) {
    const tokenHash = randomBytes(20).toString("hex");
    state.tokens.set(tokenHash, { email: to, type, used: false, expiresAt: Date.now() + 3600_000 });
    state.outbox.push({ to, type, tokenHash, redirectTo: redirectTo ?? null });
  }

  const weak = (p) => typeof p !== "string" || p.length < 6;

  async function readBody(req) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks).toString("utf8");
    if (!raw) return {};
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }

  async function handle(req, res) {
    const url = new URL(req.url, "http://fake");
    const path = url.pathname;
    const send = (status, body, extra = {}) => {
      res.writeHead(status, { "content-type": "application/json", "x-supabase-api-version": "2024-01-01", "access-control-allow-origin": "*", ...extra });
      res.end(body === undefined ? "" : JSON.stringify(body));
    };
    if (req.method === "OPTIONS") {
      res.writeHead(204, { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" });
      res.end();
      return;
    }
    if (!path.startsWith("/__test")) state.requests.push({ method: req.method, path });
    const body = req.method === "GET" ? {} : await readBody(req);

    // ---- test control -------------------------------------------------------------------
    if (path === "/__test/outbox") return send(200, state.outbox);
    if (path === "/__test/state") return send(200, { users: [...state.users.values()].map((u) => ({ id: u.id, email: u.email, confirmed: Boolean(u.confirmedAt) })), sessions: state.sessions.size });
    if (path === "/__test/expire-all") {
      for (const s of state.sessions.values()) s.revoked = true;
      state.refresh.clear();
      return send(200, { ok: true });
    }
    if (path === "/__test/toggle") {
      if (typeof body.profilesPolicies === "boolean") state.profilesPolicies = body.profilesPolicies;
      if (typeof body.authDown === "boolean") state.authDown = body.authDown;
      if (typeof body.accessTtl === "number") state.accessTtl = body.accessTtl;
      return send(200, { ok: true });
    }
    if (path === "/__test/reset") {
      for (const k of ["users", "sessions", "refresh", "tokens", "profiles"]) state[k].clear();
      state.outbox.length = 0;
      state.requests.length = 0;
      state.profilesPolicies = true;
      state.authDown = false;
      state.accessTtl = 3600;
      return send(200, { ok: true });
    }

    if (state.authDown && path.startsWith("/auth/")) return send(503, { message: "unavailable" });

    // ---- GoTrue ---------------------------------------------------------------------------
    if (path === "/auth/v1/health") return send(200, { version: "fake", name: "GoTrue", description: "EJEMPLO-FICTICIO" });
    if (path === "/auth/v1/signup" && req.method === "POST") {
      const email = String(body.email ?? "").toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return send(400, { code: "validation_failed", message: "invalid email" });
      if (weak(body.password)) return send(422, { code: "weak_password", message: "Password should be at least 6 characters.", weak_password: { reasons: ["length"] } });
      const existing = state.users.get(email);
      if (existing) {
        // GoTrue with "Confirm email": an obfuscated user, no session, no email sent.
        return send(200, { ...publicUser(existing), id: randomUUID(), identities: [] });
      }
      const user = { id: randomUUID(), email, password: body.password, confirmedAt: null, meta: body.data ?? {}, createdAt: new Date().toISOString() };
      state.users.set(email, user);
      state.profiles.set(user.id, { id: user.id, full_name: String(user.meta.full_name ?? ""), phone: "", country: "", region: "", updated_at: new Date().toISOString() });
      mail(email, "signup", url.searchParams.get("redirect_to"));
      return send(200, publicUser(user));
    }
    if (path === "/auth/v1/token" && req.method === "POST") {
      const grant = url.searchParams.get("grant_type");
      if (grant === "password") {
        const user = state.users.get(String(body.email ?? "").toLowerCase());
        if (!user || user.password !== body.password) return send(400, { code: "invalid_credentials", message: "Invalid login credentials" });
        if (!user.confirmedAt) return send(400, { code: "email_not_confirmed", message: "Email not confirmed" });
        return send(200, issueSession(user, "password"));
      }
      if (grant === "refresh_token") {
        const sessionId = state.refresh.get(body.refresh_token);
        const s = sessionId ? state.sessions.get(sessionId) : null;
        if (!s || s.revoked) return send(400, { code: "refresh_token_not_found", message: "Invalid Refresh Token: Refresh Token Not Found" });
        state.refresh.delete(body.refresh_token);
        return send(200, tokensFor(userById(s.userId), sessionId));
      }
      return send(400, { code: "validation_failed", message: "unsupported grant" });
    }
    if (path === "/auth/v1/user" && req.method === "GET") {
      const [err, user] = authenticate(req);
      if (err) return send(err, user);
      return send(200, publicUser(user));
    }
    if (path === "/auth/v1/user" && req.method === "PUT") {
      const [err, user] = authenticate(req);
      if (err) return send(err, user);
      if (body.password !== undefined) {
        if (weak(body.password)) return send(422, { code: "weak_password", message: "weak", weak_password: { reasons: ["length"] } });
        if (body.password === user.password) return send(422, { code: "same_password", message: "New password should be different from the old password." });
        user.password = body.password;
      }
      return send(200, publicUser(user));
    }
    if (path === "/auth/v1/logout" && req.method === "POST") {
      const [err, user, claims] = authenticate(req);
      if (err) return send(204);
      const scope = url.searchParams.get("scope") ?? "global";
      for (const [id, s] of state.sessions) {
        if (s.userId !== user.id) continue;
        if (scope === "global" || (scope === "local" && id === claims.session_id) || (scope === "others" && id !== claims.session_id)) s.revoked = true;
      }
      return send(204);
    }
    if (path === "/auth/v1/recover" && req.method === "POST") {
      const user = state.users.get(String(body.email ?? "").toLowerCase());
      if (user) mail(user.email, "recovery", url.searchParams.get("redirect_to"));
      return send(200, {});
    }
    if (path === "/auth/v1/resend" && req.method === "POST") {
      const user = state.users.get(String(body.email ?? "").toLowerCase());
      if (user && !user.confirmedAt && body.type === "signup") mail(user.email, "signup", url.searchParams.get("redirect_to"));
      return send(200, {});
    }
    if (path === "/auth/v1/verify" && req.method === "POST") {
      const token = state.tokens.get(body.token_hash);
      const type = body.type === "email" ? "signup" : body.type;
      if (!token || token.used || token.expiresAt < Date.now() || token.type !== type) return send(403, { code: "otp_expired", message: "Email link is invalid or has expired" });
      token.used = true;
      const user = state.users.get(token.email);
      if (!user.confirmedAt) user.confirmedAt = new Date().toISOString();
      return send(200, issueSession(user, type === "recovery" ? "recovery" : "otp"));
    }

    // ---- PostgREST: public.profiles (own row only, like database/sql/09) -------------------
    if (path === "/rest/v1/profiles") {
      const [err, user] = authenticate(req);
      if (err) return send(401, { code: "PGRST301", message: "JWT invalid" });
      if (!state.profilesPolicies) return send(403, { code: "42501", message: "permission denied for table profiles" });
      const idFilter = url.searchParams.get("id");
      const row = state.profiles.get(user.id);
      const visible = row && (!idFilter || idFilter === `eq.${user.id}`) ? [row] : [];
      if (req.method === "GET") return send(200, visible);
      if (req.method === "PATCH") {
        const allowed = ["full_name", "phone", "country", "region"];
        if (Object.keys(body).some((k) => !allowed.includes(k))) return send(403, { code: "42501", message: "permission denied for column" });
        for (const r of visible) Object.assign(r, body, { updated_at: new Date().toISOString() });
        return send(200, visible);
      }
    }
    return send(404, { code: "not_found", message: "not found" });
  }

  return { state, handle };
}

/** Starts the fake on 127.0.0.1 (port 0 = random). Returns { url, state, close }. */
export async function startFakeSupabase(port = 0) {
  const fake = createFakeSupabase();
  const server = createServer((req, res) => {
    fake.handle(req, res).catch(() => {
      res.writeHead(500);
      res.end();
    });
  });
  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
  const address = server.address();
  return {
    url: `http://127.0.0.1:${address.port}`,
    state: fake.state,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.argv[2] ?? 54329);
  const { url } = await startFakeSupabase(port);
  console.warn(`fake supabase listening on ${url}`);
}
