# DO Lifecycle Scheduler

> Automate DigitalOcean Droplet lifecycle: **snapshot → delete → recreate → health-check** on a recurring weekly schedule.

[![Deploy to DO](https://www.deploytodo.com/do-btn-blue.svg)](https://cloud.digitalocean.com/apps/new?repo=https://github.com/aksprat/do-lifecycle-scheduler/tree/main)

---

## What it does

| Step | What happens |
|------|-------------|
| **Deletion** | Creates a snapshot, waits for it to complete, then deletes the Droplet |
| **Recreation** | Recreates the Droplet from the latest snapshot, waits for it to become active |
| **Health check** | Sends an ICMP ping + HTTP probe to the new Droplet's public IP |
| **Cleanup** | Auto-deletes the snapshot 2 hours after a successful recreation |
| **Reporting** | Every event is logged; optional email report via SMTP after each cycle |

Schedules are stored in SQLite and **survive server restarts** — no jobs are lost if the app is restarted.

---

## Deploy to DigitalOcean App Platform

Click the button above, or:

1. **Fork** this repo to your GitHub account
2. Go to [DigitalOcean App Platform](https://cloud.digitalocean.com/apps)
3. Click **Create App → GitHub** and select your fork
4. App Platform will auto-detect the Next.js app — keep all defaults
5. Click **Deploy**

> **Persistence note:** The free/basic tier uses ephemeral storage. Your schedules and API key reset on each redeploy. To persist data across deployments, add a **Volume** mount at `/workspace/data` in the App Platform settings (Resources → Add Volume).

---

## Features

- **API key auth** — Enter your DigitalOcean Personal Access Token; validated against the API before storing
- **Droplet listing** — Fetches all Droplets with name, IP, region, size, status, and tags
- **Tag filter** — Filter the Droplet list by tag; "Select All" respects the active filter
- **Weekly schedules** — Pick day-of-week + time for deletion and recreation; supports any IANA timezone
- **Persistent jobs** — Schedules survive app restarts (SQLite-backed, reloaded on boot)
- **Retry & backoff** — All DigitalOcean API calls retry on 429 / 5xx with exponential backoff
- **Reports log** — Paginated event log with filtering by event type
- **Email notifications** — Optional SMTP config to receive an HTML report after each recreation cycle

---

## Local development

**Requirements:** Node.js 18+

```bash
git clone https://github.com/aksprat/do-lifecycle-scheduler.git
cd do-lifecycle-scheduler
npm install
npm run dev
# Open http://localhost:3000
```

Enter your [DigitalOcean Personal Access Token](https://cloud.digitalocean.com/account/api/tokens) on the login screen.

---

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATA_DIR` | `./data` | Directory where `scheduler.db` is stored |
| `PORT` | `3000` | Port the server listens on |
| `NODE_ENV` | `development` | Set to `production` in deployment |

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Framework | [Next.js 14](https://nextjs.org) (App Router) |
| Database | [SQLite](https://sqlite.org) via [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) |
| Scheduler | [node-cron](https://github.com/node-cron/node-cron) (persisted in SQLite) |
| DO API client | [axios](https://axios-http.com) with retry/backoff |
| Email | [nodemailer](https://nodemailer.com) |
| Styling | [Tailwind CSS](https://tailwindcss.com) |

---

## Architecture

```
app/
├── api/
│   ├── auth/        # POST to validate + store API key
│   ├── droplets/    # GET fetches live from DigitalOcean
│   ├── schedules/   # CRUD — registers/unregisters cron jobs
│   ├── reports/     # Paginated event log
│   ├── settings/    # SMTP + timezone config
│   └── init/        # Boot-time scheduler reload
lib/
├── db.ts            # SQLite schema + typed helpers
├── digitalocean.ts  # DO API client (snapshot, delete, recreate, poll)
├── scheduler.ts     # LifecycleScheduler singleton + workflows
└── mailer.ts        # SMTP report emails
```

The scheduler runs as a **global singleton** inside the Next.js server process. On startup it loads all active schedules from SQLite and re-registers their cron jobs — so workflows continue running even after the app restarts.

---

## License

MIT
