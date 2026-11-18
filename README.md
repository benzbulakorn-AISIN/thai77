# เที่ยวไทย 77 จังหวัด (Thailand 77 Trip Planner)

React + TypeScript + Vite + Tailwind v4 + Supabase, deployed on GitHub Pages (HashRouter).

## Local dev (optional — needs Node.js 20+)
```bash
cp .env.example .env.local   # fill VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
npm install
npm run dev                   # http://localhost:5173/#/
npm run build                 # type-check + production build to dist/
```

## Deploy (GitHub Pages)
1. Push this repo to GitHub (branch `main`).
2. Settings → Pages → Source = **GitHub Actions**.
3. Settings → Secrets and variables → Actions → **Variables** tab → add
   `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (anon/publishable key only).
4. Actions → "Deploy to GitHub Pages" → Run workflow (or push any commit).
5. Open `https://<user>.github.io/<repo>/`.

## Supabase Auth URLs
Authentication → URL Configuration:
- Site URL: `https://<user>.github.io/<repo>/`
- Redirect URLs: `https://<user>.github.io/<repo>/` and `http://localhost:5173/`

## Security
- Never commit `.env.local` or the service_role / secret key.
- Data access is enforced by RLS (see `supabase/migrations`).
