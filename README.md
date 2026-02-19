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
- AI summary section in wallet modal (cached in Supabase)
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

## Environment Variables

Create `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-4.1-mini
```

Notes:

- `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are required for DB persistence.
- If `OPENAI_API_KEY` is missing, the app falls back to rule-based summaries and still stores them.
- Keep `SUPABASE_SERVICE_ROLE_KEY` server-side only (never expose in client code).

## Supabase Setup

Run this migration in Supabase SQL editor:

- `supabase/migrations/001_wallet_ai_summaries.sql`
- `supabase/migrations/002_watchlist_wallets.sql`

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
- AI summary endpoint:
- `POST /api/ai-summary`
- Behavior:
- Read from `wallet_ai_summaries` by wallet + payload hash
- Generate summary with OpenAI if cache miss
- Fall back to deterministic rule-based summary if AI key is unavailable
- Upsert back into Supabase for reuse
- Watchlist endpoint:
- `GET /api/watchlist`
- `POST /api/watchlist`
- `DELETE /api/watchlist`
- Behavior:
- Persists tracked wallets in Supabase table `watchlist_wallets`
- Scopes records by a per-browser client id stored in localStorage

## Deployment (Vercel)

1. Push repo to GitHub.
2. Import project in Vercel.
3. Framework preset: `Next.js`.
4. Build command: `npm run build`.
5. Deploy.

## Legacy Files

Previous static implementation is kept in:

- `legacy/`
