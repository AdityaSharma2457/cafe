# Dishu's Cafe

A Next.js cafe ordering app deployed to Cloudflare Workers with Cloudflare D1. Customers can browse the menu and place orders; the chef dashboard can manage dishes and orders.

## Requirements

- Node.js 22 or newer
- npm
- A Cloudflare account with Workers and D1 enabled
- Wrangler authenticated with the Cloudflare account for remote preview or deployment

## Local development

```powershell
npm ci
Copy-Item .dev.vars.example .dev.vars
```

Edit `.dev.vars` and set a private `CAFE_ADMIN_PASSWORD`. Then apply the schema and starter menu to the local D1 database and start Next.js:

```powershell
npx wrangler d1 migrations apply cafe-db --local
npm run dev
```

Open <http://localhost:3000>. Local D1 data is stored by Wrangler and is separate from the remote database. `npm run preview` builds the app and runs it in the Workers runtime for a production-like local check.

## Cloudflare configuration

`wrangler.jsonc` configures the Worker, the D1 binding (`DB`), and the migration directory. Keep the Worker name, self-reference service name, D1 database name, binding, and database ID in sync with the Cloudflare resources. The D1 database ID in this file is an account resource identifier, not a secret.

Set the chef password as a Cloudflare Worker secret; do not commit it:

```powershell
npx wrangler secret put CAFE_ADMIN_PASSWORD
```

The migration in `migrations/0001_init.sql` creates the tables, indexes, and starter menu. Before applying migrations remotely, check their status:

```powershell
npx wrangler d1 migrations list cafe-db --remote
```

Apply a migration to a new/empty production database with:

```powershell
npx wrangler d1 migrations apply cafe-db --remote
```

Do not apply the initial migration to an existing database unless Wrangler reports it as already applied or you have confirmed the schema is empty. The migration creates tables and seeds menu records; it is not a data import for an existing SQLite database. Remote migration application is intentionally a separate step from deploying the Worker.

## Build and deploy

```powershell
npm run typecheck
npm run preview
npm run deploy
```

`npm run deploy` builds through OpenNext and deploys the Worker. If Cloudflare Workers Builds deploys this repository from Git, use `npx opennextjs-cloudflare build` as the build command and `npx wrangler deploy` as the deploy command. Configure `CAFE_ADMIN_PASSWORD` as a Worker secret with `wrangler secret put` or in the Worker's secret settings. Do not use `npm run build` alone as the Cloudflare build command; it only creates the standard Next.js output.

## Data and secrets

`.env*`, `.dev.vars`, Wrangler state, build output, the local SQLite database, and `data.sql` are ignored by Git. `data.sql` is a local database export and can contain customer names, notes, and order history; do not publish it. The D1 migration is the versioned schema and starter menu, not a backup. Back up production data through Cloudflare's D1 backup facilities before making database changes.

The chef session is an HTTP-only, same-site cookie signed with the configured password and expires after eight hours. Use a long, unique password and HTTPS in production.

## Main features

- Browse categories and available dishes, build a cart, choose a table, and submit orders.
- Track delivery status from the customer confirmation screen.
- Sign in to the chef dashboard to manage categories and dishes, review orders, mark orders delivered, and view daily sales totals.
- Validate dish availability and calculate order totals on the server.
