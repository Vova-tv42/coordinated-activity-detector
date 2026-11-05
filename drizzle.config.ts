import { defineConfig } from 'drizzle-kit';
import { resolveDatabasePath } from './src/db/connection';

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './drizzle',
  casing: 'snake_case',
  dbCredentials: {
    url: resolveDatabasePath(),
  },
});
