# Drraww

Infinite canvas notes with Google sign-in, Supabase-backed storage, and autosave-ready editor (tldraw integration coming next).

## Stack

- Next.js (App Router, TypeScript, Tailwind)
- Supabase (Auth + Postgres + Storage with RLS)
- Planned editor: tldraw for vector scene storage + exports

## Prerequisites

- Node 20 (`.nvmrc` is included)  
  ```
  export NVM_DIR="$HOME/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
  nvm use 20
  ```
- npm

## Setup

1) Install deps

```bash
npm install
```

2) Environment

Copy `.env.local.example` to `.env.local` and fill:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=   # server-only
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_ASSETS_BUCKET=note-assets
```

3) Supabase (one-time)

- Create a project.
- Run `supabase/migrations/0001_init.sql` in the SQL editor (or Supabase CLI) to create tables, RLS policies, and the `note-assets` bucket policies.
- Enable Google provider in Supabase Auth; add `http://localhost:3000/auth/callback` and your production URL equivalent to Redirect URLs.
- Set the same URLs in `NEXT_PUBLIC_SITE_URL` (for OAuth redirect construction).

4) Development

```bash
nvm use 20
npm run dev
```

Visit `http://localhost:3000` to sign in with Google; authenticated users are redirected to `/app`.

## Current state

- Landing page with Google sign-in.
- Supabase auth wiring (server + client providers) and OAuth callback route.
- Protected `/app` shell ready for dashboard/editor work.
- Database schema + RLS + storage bucket policies checked in under `supabase/migrations/0001_init.sql`.

## Next up

- Notes dashboard (list/create/rename/delete + search).
- tldraw editor with autosave, offline restore, undo/redo, export.
- Thumbnails + storage uploads to `note-assets`.

## FYI
Currently very glitchy (WIP).
