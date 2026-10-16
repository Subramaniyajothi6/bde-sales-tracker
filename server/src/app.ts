import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { env, isProd } from './lib/env.js';
import { errorHandler, HttpError } from './lib/http.js';
import { requireAuth } from './lib/auth.js';
import { auth } from './routes/auth.js';
import { users } from './routes/users.js';
import { courses } from './routes/courses.js';
import { today } from './routes/today.js';
import { dailyReports } from './routes/dailyReports.js';
import { leads } from './routes/leads.js';
import { interviews } from './routes/interviews.js';
import { payments } from './routes/payments.js';
import { stats } from './routes/stats.js';
import { exportsRouter } from './routes/exports.js';
import { attendance } from './routes/attendance.js';
import { leaves } from './routes/leaves.js';
import { chat } from './routes/chat.js';
import { activity } from './routes/activity.js';
import { leadImport } from './routes/leadImport.js';
import { leadSheet } from './routes/leadSheet.js';
import { assign } from './routes/assign.js';
import { reports } from './routes/reports.js';
import { notifications } from './routes/notifications.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1); // behind Nginx/Caddy in production, so rate limits see the real address
  app.disable('x-powered-by');
  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'same-origin' },
    contentSecurityPolicy: {
      directives: {
        // blob: lets a BDE preview the receipt photo before uploading it
        'img-src': ["'self'", 'data:', 'blob:'],
        // Force HTTPS only in production (with a domain and certificate); plain http on an office network stays usable
        'upgrade-insecure-requests': isProd ? [] : null
      }
    }
  }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  // During development the web app runs on another port (Vite). Allow only that address.
  const webOrigin = env.WEB_ORIGIN;
  if (webOrigin) {
    app.use('/api', (req, res, next) => {
      if (req.headers.origin === webOrigin) {
        res.setHeader('Access-Control-Allow-Origin', webOrigin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE');
        res.setHeader('Vary', 'Origin');
      }
      if (req.method === 'OPTIONS') return void res.sendStatus(204);
      next();
    });
  }

  app.get('/api/health', (_req, res) => { res.json({ ok: true }); });
  app.use('/api/auth', auth);

  // Everything below needs a logged-in user
  app.use('/api', requireAuth);
  app.use('/api/users', users);
  app.use('/api/courses', courses);
  app.use('/api/today', today);
  app.use('/api/daily-reports', dailyReports);
  app.use('/api/leads/import', leadImport);
  app.use('/api/leads/sheet', leadSheet);
  app.use('/api/leads', leads);
  app.use('/api/interviews', interviews);
  app.use('/api/payments', payments);
  app.use('/api/stats', stats);
  app.use('/api/exports', exportsRouter);
  app.use('/api/attendance', attendance);
  app.use('/api/leaves', leaves);
  app.use('/api/chat', chat);
  app.use('/api/activity', activity);
  app.use('/api/reports', reports);
  app.use('/api/assign', assign);
  app.use('/api/notifications', notifications);
  app.use('/api', () => { throw new HttpError(404, 'No such API endpoint'); });

  // In production the built web app is served from here too: one server, one address
  const webDist = path.resolve(env.WEB_DIST ?? '../client/dist');
  if (existsSync(webDist)) {
    app.use(express.static(webDist, { index: false, maxAge: '1h' }));
    app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(webDist, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}
