import "server-only";
import { createClient } from "@supabase/supabase-js";

import type { Database } from "./types";

/**
 * Admin client using the service_role key. Bypasses RLS.
 * SERVER ONLY — never import from a Client Component.
 * Use sparingly: scrapers, scheduled jobs, migrations.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL",
    );
  }
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
