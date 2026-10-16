# Going live

The app is one Node.js server that also serves the web pages, plus a MySQL database and a folder of receipt files. Every choice below keeps the code the same. Only `server/.env` changes.

## Stage 1: free, now

**Option A: an office computer (simplest, fully free).**
A PC that stays on during working hours runs MySQL and the app. BDEs open it on office Wi-Fi.

```bash
cd web && npm run build
cd ../server && npm run build && npm start      # serves app + API on port 4000
```

BDEs open `http://<office-pc-ip>:4000` (find the IP with `ipconfig`). Allow port 4000 in Windows Firewall for the private network.

- Works only inside the office network.
- Back up the database daily (see Backups below).
- Leave `NODE_ENV=development` while it's on plain `http://`. Production mode turns on secure cookies and HTTPS-only rules, which need a certificate.

**Option B: free cloud tiers (reachable from anywhere).**
Several providers offer free plans for a small Node.js app and a small MySQL database. Free plans change often, so check current limits before choosing. Watch for:

- Apps that "sleep" when idle (first open of the day is slow).
- Servers whose disk is wiped on restart. Receipts would be lost, so on those, add cloud storage for receipts first (see "Receipt storage").
- Database size limits. This app's data is small; receipts are the big part and don't go in the database.

### Option B in practice: Render + Aiven (no credit card)

This is how the app runs live for now. Everything is set in [`render.yaml`](../render.yaml).

| Part | Service | Free plan notes |
|---|---|---|
| App (web pages + API) | [Render](https://render.com) web service, Singapore | Sleeps after about 15 minutes with no visitors; the next visit takes about a minute to wake it. Its disk is wiped on every restart. |
| Database | [Aiven](https://aiven.io) MySQL 8, free plan | Small (about 1 GB), plenty for this app. |
| Receipts | Inside the database (`STORAGE_DRIVER=db`) | Because Render's disk is wiped. Uploads are at most 5 MB each. |

**Set up once**

1. **Aiven:** sign up, create a **MySQL** service on the **Free** plan, nearest region. When it is running, copy the **Service URI** and download the **CA certificate**.
2. Save the CA certificate as `server/prisma/aiven-ca.pem` and commit it. It is public, not a secret.
3. Make the app's database address from the Service URI: replace `?ssl-mode=REQUIRED` at the end with `?sslcert=aiven-ca.pem&sslaccept=strict`:
   `mysql://avnadmin:<password>@<host>:<port>/defaultdb?sslcert=aiven-ca.pem&sslaccept=strict`
4. **Render:** sign up with GitHub, **New > Blueprint**, pick this repository. It reads `render.yaml` and asks for `DATABASE_URL`: paste the address from step 3. The first build takes a few minutes; when the app starts it creates the tables. The app is then at `https://<name>.onrender.com`.
5. **Create the admin account and the courses** from your own computer. Put these in `server/.env.production` (git ignores it): `DATABASE_URL` (from step 3), `JWT_SECRET` (any 32+ characters), `SEED_ADMIN_PASSWORD` (a strong one) and `SEED_SAMPLE_DATA=false`. Then in `server/`:

   ```powershell
   npx tsx --env-file=.env.production prisma/seed.ts
   ```

6. Sign in as `ADMIN-01` with the seed password and change it at once. Add the BDEs under **Team**.

**After that:** every push to `main` goes live by itself. New database changes in `server/prisma/migrations` are applied when the app starts.

**Keeping it awake (optional):** a free monitor such as UptimeRobot opening `https://<name>.onrender.com/api/health` every 5 minutes stops it sleeping during office hours.

**Backups:** Aiven's free plan has no backups to rely on. Once a week, from your computer:
`mysqldump -h <host> -P <port> -u avnadmin -p --ssl-mode=REQUIRED --single-transaction defaultdb > bde-live-<date>.sql`

## Stage 2: paid domain and server, later

1. **Buy the domain** (e.g. `adz4needz.com`) and point a sub-address like `crm.adz4needz.com` at the server.
2. **A small Linux server (VPS)** with 1–2 GB RAM is enough for 31 users. Install Node.js 20+, MySQL 8, and a web server in front for HTTPS (Caddy gets a free certificate automatically; Nginx + Let's Encrypt also works).
3. **Copy the app, set `server/.env`:**

   ```env
   NODE_ENV=production
   DATABASE_URL="mysql://bde_app:<password>@localhost:3306/bde_tracker"
   JWT_SECRET="<new long random string>"
   PORT=4000
   WEB_ORIGIN=
   UPLOAD_DIR=/var/lib/bde-tracker/uploads
   ```

4. **Build and start:**

   ```bash
   cd web && npm ci && npm run build
   cd ../server && npm ci && npm run build && npm run db:deploy && npm run db:seed
   npm start          # keep it running with a process manager such as pm2 or systemd
   ```

5. **Caddy example** (`/etc/caddy/Caddyfile`):

   ```
   crm.adz4needz.com {
     reverse_proxy localhost:4000
   }
   ```

Moving data from Stage 1: export the database with `mysqldump`, import it on the new server, and copy the `uploads` folder.

## Receipt storage

Receipts are saved through one small interface in `server/src/lib/storage.ts`. Today it writes to a folder (`UPLOAD_DIR`). To use S3-compatible cloud storage later (AWS S3, Cloudflare R2, or self-hosted MinIO, which is open source), add a second class there using `@aws-sdk/client-s3` and select it with `STORAGE_DRIVER`. Nothing else in the app changes.

## Backups

Run daily, keep at least 14 days, and copy them off the server:

```bash
mysqldump -u bde_app -p --single-transaction bde_tracker > bde_tracker-$(date +%F).sql
```

Also back up the `uploads` folder.

## Before go-live checklist

- [ ] `SEED_SAMPLE_DATA=false`. Never put sample data in the live database.
- [ ] New `JWT_SECRET` and a strong admin password; change the admin password after first login.
- [ ] HTTPS working; `NODE_ENV=production`. HTTPS is also what lets BDEs **install the app** on their phones (Android shows "Install"; iPhone uses Share > Add to Home Screen). On plain `http://` over the office network the app works in the browser but can't be installed.
- [ ] `LATE_AFTER` in `server/.env` matches office start time (default `10:00`).
- [ ] Daily backups running and one restore tested.
- [ ] Team has agreed the rules in `docs/DECISIONS.md` (especially #3, part payments).
