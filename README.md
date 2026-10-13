# ADZ4NEEDZ BDE Team Management & Sales Tracking

Web app for 30 BDEs and their admin. BDEs log calls, manage leads, book interviews and record payments from their phone. The admin sees every BDE's reports, verifies payment receipts and downloads Excel/PDF reports.

Everything here is free and open source. Moving to a paid server and domain later only means changing settings (see [docs/DEPLOY.md](docs/DEPLOY.md)).

## How it's built

```
app/
  server/   API: Node.js + Express + TypeScript, Prisma, MySQL
  web/      Screens: React + Vite (Direction H "Minimal" design)
  docs/     DECISIONS.md (business rules), API.md (every endpoint), DEPLOY.md
```

The web app only talks to the server through `web/src/api/`. A new design can replace `web/src/pages` and `web/src/styles` and keep working against the same server and data.

| Part | Libraries (all open source) |
|---|---|
| Server | express, prisma + @prisma/client, zod, bcryptjs, jsonwebtoken, multer, exceljs, helmet, express-rate-limit |
| Web | react, react-dom, react-router-dom, vite |
| Database | MySQL 8 Community |

## Run it on your computer

You need Node.js 20 or newer and MySQL 8.

**1. Database (once).** In MySQL, as root:

```sql
CREATE DATABASE bde_tracker CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'bde_app'@'localhost' IDENTIFIED BY 'choose-a-password';
GRANT ALL PRIVILEGES ON bde_tracker.* TO 'bde_app'@'localhost';
```

**2. Server settings.** Copy `server/.env.example` to `server/.env` and fill it in (database password, a random `JWT_SECRET`, the first admin password). For demo data set `SEED_SAMPLE_DATA=true`.

**3. Install, create tables, add first data:**

```bash
cd server
npm install
npm run db:deploy     # creates the tables
npm run db:seed       # ADMIN-01, courses, and sample data if switched on
cd ../web
npm install
```

**4. Start both (two terminals):**

```bash
cd server && npm run dev     # API on http://localhost:4000
cd web && npm run dev        # app on http://localhost:5173
```

Open http://localhost:5173 and sign in as `ADMIN-01` with the password from `.env`. With sample data, BDEs are `BDE-001` to `BDE-030` with password `Bde@12345`.

To open it on a phone on the same Wi-Fi, run `npm run dev -- --host` in `web/` and open the "Network" address it prints.

## Useful commands

| Where | Command | What it does |
|---|---|---|
| server | `npm run dev` | API with auto-restart on code changes |
| server | `npm run check:api` | Tests every API flow (68 checks). **Development database only**: it adds test records. |
| server | `npm run typecheck` | Checks the TypeScript |
| server | `npm run db:migrate` | After changing `prisma/schema.prisma`: creates a migration and applies it |
| server | `npx prisma studio` | Browse and edit the database in the browser |
| web | `npm run build` | Production build into `web/dist` (the server serves it) |

## Changing things safely

- **Wording on screen** (e.g. status names): `web/src/lib/format.ts`.
- **Colours, fonts, spacing**: `web/src/styles/base.css` (the `:root` variables at the top).
- **Business rules** (what counts as revenue, who can do what): the server, in `server/src/routes/`. Update `docs/DECISIONS.md` too.
- **Database changes**: edit `server/prisma/schema.prisma`, run `npm run db:migrate`, and commit the new folder in `prisma/migrations`.

## Known notes

- `npm audit` in `server/` reports an issue inside the Prisma command-line tool (`deepmerge-ts`). That tool only runs on developer machines during database changes, never in the running app.
- PDF downloads use the browser's "Save as PDF" on the report page.
