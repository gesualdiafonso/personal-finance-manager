/** Types of the test-only fake Supabase server (fake-supabase-server.mjs). */
export interface FakeSupabaseState {
  requests: { method: string; path: string }[];
  outbox: { to: string; type: string; tokenHash: string; redirectTo: string | null }[];
  profilesPolicies: boolean;
  authDown: boolean;
  accessTtl: number;
}
export function startFakeSupabase(port?: number): Promise<{ url: string; state: FakeSupabaseState; close: () => Promise<void> }>;
