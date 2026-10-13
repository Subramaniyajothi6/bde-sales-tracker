import { env } from './lib/env.js';
import { db } from './lib/db.js';
import { createApp } from './app.js';

const app = createApp();
const server = app.listen(env.PORT, () => {
  console.log(`BDE Tracker API on http://localhost:${env.PORT}  (${env.NODE_ENV})`);
});

async function shutdown() {
  server.close();
  await db.$disconnect();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
