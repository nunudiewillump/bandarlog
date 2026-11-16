import { defineConfig } from 'drizzle-kit';
export default defineConfig({
  dialect: 'postgresql',
  schema: './server/schema.ts',
  out: './migrations',
  dbCredentials: { url: process.env.MIGRATION_DATABASE_URL || '' },
});
