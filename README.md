# ADZ4NEEDZ BDE Team Management & Sales Tracking

Web app for 30 BDEs and their admin. BDEs start their day (attendance), log calls, manage leads, book interviews, record payments, ask for leave and chat with each other and the admin. It is a web app made for laptops, and it also works on tablets and phones (it can even be installed on a phone like an app). The admin sees every BDE's reports and attendance, answers leave requests, verifies payment receipts, imports leads from Excel, sees an activity log and downloads Excel/PDF reports.

Everything here is free and open source. Moving to a paid server and domain later only means changing settings (see [docs/DEPLOY.md](docs/DEPLOY.md)).

## How it's built

```
bde-sales-tracker/
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

## Setup for the team

Follow these steps once on your own computer. It takes about 15 minutes. Commands are for **Windows PowerShell**; Mac/Linux equivalents are noted where they differ.

### What you need installed

| Tool | Version | Check with | Get it |
|---|---|---|---|
| Git | any recent | `git --version` | https://git-scm.com |
| Node.js | 20 or newer (LTS) | `node --version` | https://nodejs.org |
| MySQL Server | 8.x Community | `mysql --version` | https://dev.mysql.com/downloads/installer/ (choose "Server only" or "Developer Default") |

Remember the MySQL **root password** you set during install. You need it once in step 3.

### 1. Get the code

```powershell
git clone https://github.com/Subramaniyajothi6/bde-sales-tracker.git
cd bde-sales-tracker
```

### 2. Make sure MySQL is running

Open **PowerShell as Administrator** (right-click → Run as administrator):

```powershell
net start MYSQL80
```

"The requested service has already been started" is fine. If the name is different on your PC, find it with `Get-Service *mysql*`.
(Mac: `brew services start mysql`. Linux: `sudo systemctl start mysql`.)

### 3. Create the database (once)

Open the MySQL command line as root. If `mysql` isn't recognised, use the full path, e.g. `& "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe"`.

```powershell
mysql -u root -p
```

Then paste this, replacing `choose-a-password` with a password for the app (keep it, you need it in step 4):

```sql
CREATE DATABASE bde_tracker CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'bde_app'@'localhost' IDENTIFIED BY 'choose-a-password';
GRANT ALL PRIVILEGES ON bde_tracker.* TO 'bde_app'@'localhost';
EXIT;
```

Prefer clicking? In **MySQL Workbench**, connect as root, paste the same lines into a query tab and press ⚡.

### 4. Create your settings file

```powershell
cd server
Copy-Item .env.example .env        # Mac/Linux: cp .env.example .env
```

Generate a secret for logins:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Open `server/.env` in your editor and set:

| Setting | Value |
|---|---|
| `DATABASE_URL` | `mysql://bde_app:choose-a-password@localhost:3306/bde_tracker` (your password from step 3) |
| `JWT_SECRET` | the long string printed above |
| `SEED_ADMIN_PASSWORD` | any password for the `ADMIN-01` account, 8+ characters |
| `SEED_SAMPLE_DATA` | `true` to get 30 sample BDEs with calls, leads and payments to play with |

Leave the rest as it is. **Never commit `.env`**; git already ignores it.

> If your app password contains `@`, `:`, `/` or `#`, it must be URL-encoded inside `DATABASE_URL` (e.g. `@` becomes `%40`). Easiest: use only letters and numbers.

### 5. Install and fill the database

Still in `server/`:

```powershell
npm install
npm run db:deploy      # creates the tables
npm run db:seed        # creates ADMIN-01, the courses, and sample data if switched on
```

Then the web app:

```powershell
cd ..\web              # Mac/Linux: cd ../web
npm install
```

### 6. Start it

Two terminals, both left running:

```powershell
# Terminal 1
cd server
npm run dev            # API on http://localhost:4000
```

```powershell
# Terminal 2
cd web
npm run dev            # app on http://localhost:5173
```

### 7. Sign in

Open **http://localhost:5173**.

| Role | Employee ID | Password |
|---|---|---|
| Admin | `ADMIN-01` | your `SEED_ADMIN_PASSWORD` from `.env` |
| BDE (sample data) | `BDE-001` to `BDE-030` | `Bde@12345` |

`BDE-014` (Karthik R.) has the most sample leads, interviews and payments. BDE and admin screens are made for laptops. To check how they look on a phone, press `F12` then `Ctrl + Shift + M`. To use admin and BDE at the same time, sign in to one of them in a private/incognito window.

**Check everything works (optional):** with the API running, in `server/` run `npm run check:api`. It should end with `107 passed, 0 failed`. It adds test records, so only use it on your own development database.

### On a phone

Run the web app with `npm run dev -- --host` in `web/`, then open the "Network" address it prints (like `http://192.168.1.20:5173`) on a phone connected to the same Wi-Fi. Allow Node.js through Windows Firewall if asked.

### Working together

- **Before you start work:** `git pull`. If `package.json` changed, run `npm install` in that folder. If there's a new folder in `server/prisma/migrations`, run `npm run db:deploy` in `server/`.
- **Work on a branch:** `git checkout -b your-change`, push it, and open a pull request on GitHub.
- **Changing the database design:** edit `server/prisma/schema.prisma`, then run `npm run db:migrate` and give the change a short name. Commit the new migration folder together with your code.
  This needs extra MySQL rights on your own computer only: as root, run
  `GRANT CREATE, DROP, ALTER, INDEX, REFERENCES ON *.* TO 'bde_app'@'localhost';`
- **Start over with fresh sample data:** `npm run db:reset` in `server/`. This deletes everything in your local database.

### Problems?

| What you see | Fix |
|---|---|
| `Can't reach database server at localhost:3306` (P1001) | MySQL isn't running. Do step 2. |
| `Access denied for user 'bde_app'` | The password in `DATABASE_URL` doesn't match step 3, or it has special characters that need encoding. |
| `Invalid settings in .env` when starting the API | A setting is missing or too short. `JWT_SECRET` must be at least 32 characters. |
| `Set SEED_ADMIN_PASSWORD` when seeding | Add `SEED_ADMIN_PASSWORD` (8+ characters) to `server/.env`. |
| `EADDRINUSE: address already in use :::4000` | The API is already running in another terminal. Close it, or set `PORT=4001` in `.env`. |
| Sign in fails with "Request failed (500)", or pages show "Couldn't load this" | Terminal 1 (the API) isn't running, or it stopped with an error. Check that terminal. |
| "Too many wrong passwords" | 10 wrong tries locks that ID for 15 minutes. Restarting the API clears it. |
| `prisma migrate dev` fails with a shadow database error | Give `bde_app` the extra rights shown under "Working together". |

## Useful commands

| Where | Command | What it does |
|---|---|---|
| server | `npm run dev` | API with auto-restart on code changes |
| server | `npm run check:api` | Tests every API flow (107 checks). **Development database only**: it adds test records. |
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
