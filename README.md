# Dishu's Cafe

Dishu's Cafe is a Next.js application with a customer menu and order flow, plus
a password-protected chef dashboard. Categories, dishes, orders, and delivery
history are stored in SQLite. The app uses the existing `cafe.sqlite3` database
and keeps its records; a starter menu is added only when the database has no
categories.

## Requirements

- Node.js 22.13 or newer (for the built-in `node:sqlite` module)
- npm
- A private `CAFE_ADMIN_PASSWORD`

## Run locally

In PowerShell, from this folder:

```powershell
npm install
$env:CAFE_ADMIN_PASSWORD = "choose-a-long-private-password"
npm run dev
```

Open <http://localhost:3000>. Choose **Chef sign in** to access the dashboard.
For a production server, use `npm run build` followed by `npm start`; set
`CAFE_ADMIN_PASSWORD` in the server environment rather than committing it.

To allow other devices on a trusted local network to connect, start the dev
server with `npm run dev -- --hostname 0.0.0.0` and open the computer's local
network address on those devices. For production, use HTTPS and a trusted
reverse proxy rather than exposing the development server directly.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `CAFE_ADMIN_PASSWORD` | Required | Password for the chef dashboard |
| `CAFE_DB_PATH` | `cafe.sqlite3` in this folder | SQLite database file |
| `PORT` | `3000` | Next.js server port |

The chef session is stored in an HTTP-only, same-site cookie and expires after
eight hours. SQLite should be hosted on persistent storage, with one app
instance using that database file.

## Features

- Browse categories and available dishes, add quantities to a cart, select a
  table, enter a name or special instructions, and submit an order.
- Track the order's delivery status while the confirmation dialog is open.
- Sign in as the chef to view pending orders, mark them delivered, review
  today's delivered history and sales/order totals, and refresh the dashboard.
- Add categories and priced dishes, then hide or show dishes without deleting
  their order history.
- Validate dish availability and calculate order totals on the server.

Run the TypeScript check and production build with:

```powershell
npm run typecheck
npm run build
```
