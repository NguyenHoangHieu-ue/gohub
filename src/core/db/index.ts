import { Pool } from "pg";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { createClient as createTursoClient, Client as LibsqlClient } from "@libsql/client";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`[DBClientFactory] Missing required env var: ${name}`);
  }
  return value;
}

export class DBClientFactory {
  private static pgPoolInstance: Pool | null = null;
  private static supabaseInstance: SupabaseClient | null = null;
  private static tursoInstance: LibsqlClient | null = null;

  public static getPostgresPool(): Pool {
    if (!this.pgPoolInstance) {
      const connectionString = requireEnv("ANALYTICS_DB_URL");
      this.pgPoolInstance = new Pool({
        connectionString,
        max: 20,
        idleTimeoutMillis: 10000,
        ssl: process.env.ANALYTICS_DB_SSL_CA
          ? { ca: process.env.ANALYTICS_DB_SSL_CA, rejectUnauthorized: true }
          : undefined,
      });
    }
    return this.pgPoolInstance;
  }

  public static getSupabase(): SupabaseClient {
    if (!this.supabaseInstance) {
      this.supabaseInstance = createClient(
        requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
        requireEnv("SUPABASE_SERVICE_ROLE_KEY")
      );
    }
    return this.supabaseInstance;
  }

  public static getTurso(): LibsqlClient {
    if (!this.tursoInstance) {
      this.tursoInstance = createTursoClient({
        url: requireEnv("TURSO_URL"),
        authToken: requireEnv("TURSO_AUTH_TOKEN"),
      });
    }
    return this.tursoInstance;
  }
}
