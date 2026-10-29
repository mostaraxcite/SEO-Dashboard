/** Test database (separate from dev). Seeded once per run by tests/global-setup.ts. */
export const TEST_ENV = {
  DATABASE_URL: "postgres://projecthub_app:app_dev_password@localhost:5432/projecthub_test",
  DATABASE_OWNER_URL: "postgres://projecthub_owner:owner_dev_password@localhost:5432/projecthub_test",
  DATABASE_ADMIN_URL: process.env.DATABASE_ADMIN_URL ?? "postgres://postgres:postgres@localhost:5432/postgres",
  APP_SECRET: "test-secret-0123456789abcdef0123456789abcdef",
  APP_URL: "http://localhost:3000",
  STORAGE_DIR: "./storage-test",
  AI_PROVIDER: "mock",
  EMAIL_PROVIDER: "mock",
  SMS_PROVIDER: "mock",
};
