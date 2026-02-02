# Deploying Drraww (Vercel + Supabase)

## Prereqs
- Supabase project with SQL + Storage access
- Google OAuth credentials (Client ID/Secret) with redirect `https://YOUR_DOMAIN/auth/callback`
- Vercel account

## One-time Supabase setup
1) Run `supabase/migrations/0001_init.sql` in the Supabase SQL editor (or CLI) to create tables, RLS policies, and the `note-assets` bucket policies.
2) Enable Google provider in Supabase Auth. Add redirect URLs:
   - `http://localhost:3000/auth/callback` (dev)
   - `https://YOUR_DOMAIN/auth/callback` (prod)
3) Copy keys from Supabase Settings → API:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (server-only)
4) Ensure Storage bucket `note-assets` exists (migration creates it) and policies are applied.

## Environment variables (Vercel)
Set these in both Preview and Production:
```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...  # do NOT expose to client bundles
NEXT_PUBLIC_SITE_URL=https://YOUR_DOMAIN
NEXT_PUBLIC_SUPABASE_ASSETS_BUCKET=note-assets
NEXTAUTH_URL=https://YOUR_DOMAIN
NEXTAUTH_SECRET=replace_with_strong_secret
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

## Deploy to Vercel
1) Push to GitHub/GitLab and import the repo in Vercel.
2) Set environment variables as above.
3) Deploy; Vercel will run `npm install && npm run build`.

## Local dev
```
nvm use 20
cp .env.local.example .env.local  # fill values
npm install
npm run dev
```

## Notes
- Heavy exports run client-side (PNG/PDF), so no server timeouts.
- RLS protects rows/assets; keep anon key only client-side, service role only server-side/actions.
