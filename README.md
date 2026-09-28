# LekturaC

AI presentation builder: a short brief becomes an editable slide deck, with narration, a narrated video, quizzes and a teacher classroom. React + TypeScript + Vite, backed by Supabase.

## Getting started

1. **Node 24** (see `.nvmrc`). With nvm: `nvm use`. Check with `node -v`.
2. **Install exactly what's locked:**
   ```
   npm ci
   ```
   Use `npm ci`, not `npm install`: it installs the exact versions in `package-lock.json` and never rewrites it.
3. **Environment:** copy `.env.example` to `.env`.
   - The Supabase URL and anon key are already filled in (the shared project), so login works as is.
   - Add at least one AI key (Anthropic, Groq or Gemini) to create decks. Groq is free and also enables quizzes. Cartesia is optional (voice and video).
   - `.env` is gitignored. Don't commit keys. Get real ones from the project owner or your own accounts.
4. **Run:**
   ```
   npm run dev       # http://localhost:5173
   ```

## Scripts

```
npm run dev       # Vite dev server
npm run build     # type-check, then bundle
npm run lint      # oxlint (type-aware)
npm run test      # vitest
npm run preview   # serve a production build
```

CI (`.github/workflows/ci.yml`) runs typecheck, lint, test and build on every push and PR.

## Database

Schema changes live in `supabase/migrations/` (numbered, applied in order in the Supabase SQL editor). Everyone using `.env.example`'s Supabase values shares one database, so a migration only needs applying once. If you add one, apply it to the shared project and commit the file in the same change, so the database matches the code everyone pulls.

## More

`CLAUDE.md` is the detailed architecture guide (invariants, gotchas, and why things are the way they are). Design docs are in `docs/superpowers/specs/`.
