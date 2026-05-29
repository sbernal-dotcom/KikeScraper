/**
 * Cliente Supabase para el scraper (tsx puro — NO usa "server-only" como
 * src/lib/supabase/admin.ts, que solo funciona dentro del runtime de Next).
 *
 * Usa la service_role key → bypassa RLS. Solo para scripts de scraping/jobs.
 * Nunca importar esto desde el frontend.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function createScraperClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local",
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
