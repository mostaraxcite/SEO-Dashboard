import "server-only";

function req(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === "") throw new Error(`Missing required environment variable ${name}`);
  return v;
}

export const env = {
  get databaseUrl() {
    return req("DATABASE_URL");
  },
  get databaseOwnerUrl() {
    return req("DATABASE_OWNER_URL");
  },
  get appUrl() {
    return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  },
  get appSecret() {
    const s = req("APP_SECRET");
    if (process.env.NODE_ENV === "production" && (s.length < 32 || s.includes("CHANGE_ME") || s.startsWith("dev-only"))) {
      throw new Error("APP_SECRET must be a long random value in production");
    }
    return s;
  },
  get storageDir() {
    return process.env.STORAGE_DIR ?? "./storage";
  },
  get isProduction() {
    return process.env.NODE_ENV === "production";
  },
  get devToolsEnabled() {
    return process.env.NODE_ENV !== "production" || process.env.ENABLE_DEV_MAILBOX === "true";
  },
};
