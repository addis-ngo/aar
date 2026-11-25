# AAR — Addis's Album Reviews

Album review bubble map, smart comparison rater, and live collection analytics built with React, Vite, Tailwind CSS, Express, and Firebase.

## Local Development

```bash
npm install
npm run dev
```

## Deploying to GitHub + Vite + Vercel

1. **Push this repository to GitHub.**
   - `.env*` files are excluded via `.gitignore`.
   - `firebase-applet-config.json` contains public Firebase Web SDK configuration and is safe to commit alongside your deployed `firestore.rules`.

2. **Import the GitHub repo into Vercel.**
   - Vercel automatically uses `vercel.json` (`framework: "vite"`, `npm run build` → `dist/`, and serverless `/api/*` rewrites to `api/index.ts`).

3. **Set optional Spotify environment variables in Vercel** *(Project Settings → Environment Variables)*:
   - `SPOTIFY_CLIENT_ID`
   - `SPOTIFY_CLIENT_SECRET`
   *(If omitted, album search and genre lookups fall back to the public iTunes catalog automatically.)*

4. **Authorize your Vercel domain in Firebase:**
   - Open **Firebase Console → Authentication → Settings → Authorized domains** and add your `*.vercel.app` (and any custom) domain so Google Sign-In works.
