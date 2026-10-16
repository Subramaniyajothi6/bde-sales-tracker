import 'dotenv/config';
import { z } from 'zod';

/** Every setting the server reads, checked once at start-up. */
const schema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  WEB_ORIGIN: z.string().optional(),
  /** local = a folder on this server; db = inside MySQL (for hosts whose disk is wiped on restart) */
  STORAGE_DRIVER: z.enum(['local', 'db']).default('local'),
  UPLOAD_DIR: z.string().default('./uploads'),
  REPORT_CUTOFF: z.string().regex(/^\d{2}:\d{2}$/).default('19:30'),
  /** Punching in after this time (India time) counts as late */
  LATE_AFTER: z.string().regex(/^\d{2}:\d{2}$/).default('10:00'),
  WEB_DIST: z.string().optional()
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid settings in .env:');
  for (const issue of parsed.error.issues) console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  process.exit(1);
}
export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
