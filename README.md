# Polymarket Leaderboard

Next.js (TypeScript) app for viewing top Polymarket traders, wallet details, and a personal watchlist.

## Features

- Live leaderboard from `https://data-api.polymarket.com`
- Sort by `PNL` and `Volume`
- Wallet details modal:
- Lifetime PNL / Volume
- Position details
- Trading history
- Realized PNL chart
- Watchlist with local persistence (`localStorage`)
- CSV export:
- Leaderboard
- Position Details
- Trading History
- Light / dark mode toggle
- PWA support:
- `manifest.webmanifest`
- Service worker (`/sw.js`)

## Tech Stack

- Next.js 14
- React 18
- TypeScript

## Project Structure

- `app/page.tsx`: main UI and data logic
- `app/globals.css`: global styles and theme variables
- `app/layout.tsx`: app shell + service worker registration
- `app/manifest.ts`: PWA manifest
- `app/api/public-profile/route.ts`: proxy for Polymarket public profile endpoint
- `public/sw.js`: service worker

## Local Development

1. Install dependencies:

```bash
npm install
```

2. Start dev server:

```bash
npm run dev
```

3. Open:

```text
http://localhost:3000
```

## Build and Run

Build:

```bash
npm run build
```

Start production server:

```bash
npm run start
```

## API Notes

- Leaderboard and trading data are fetched from Polymarket Data API on the client.
- Public profile is requested through local proxy:
- `/api/public-profile?address=<wallet>`
- Proxy target:
- `https://gamma-api.polymarket.com/public-profile`

## Deployment (Vercel)

1. Push repo to GitHub.
2. Import project in Vercel.
3. Framework preset: `Next.js`.
4. Build command: `npm run build`.
5. Deploy.

## Legacy Files

Previous static implementation is kept in:

- `legacy/`
