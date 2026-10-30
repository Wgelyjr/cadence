# BabyApp

Track everything your baby needs — sleep, feeds, diapers, growth, milestones,
solid foods, and (when you're closer to due date) labor contractions.
BabyApp is an **installable, offline-first PWA**: it works fully on-device,
and syncs across phones and caregivers when you connect a backend.

> BabyApp is a care-tracking tool, not a medical device and not a medical
> service. Nothing in it is medical advice — for anything health-related,
> talk to your own doctor or a health professional.

## Features

- **Local-first** — everything is stored in IndexedDB on the device; the app
  is fully usable with no backend and no network.
- **Care logging** — sleep (nap/night, with live timer), feeding (nursing
  side + minutes, bottle/pump volume), diapers (wet/dirty + stool notes),
  growth, health/temperature/medicine, milestones, solid foods, allergy
  reactions, contractions.
- **SweetSpot** — age-based wake-window heuristic that suggests the next nap
  and bedtime windows from your recorded sleep. A starting point, not
  medical advice.
- **Today dashboard** — daily sleep/feeds/diapers summary + today's timeline.
- **History** — full timeline grouped by day.
- **Multi-child** — switch between babies; per-child data everywhere.
- **Sync (optional)** — Supabase + last-write-wins sync, soft deletes,
  real-time-ish pull on focus; sign in with email (Google/Apple can be added
  in the Supabase dashboard).
- **Barry (AI assistant, optional)** — answers grounded in a small curated
  reference corpus (RAG) plus your own last-48h summary, streamed live.
  Uses any **OpenAI-compatible endpoint** you configure — OpenAI, Groq,
  Together, or local (Ollama / LM Studio / vLLM). API keys never touch the
  browser.
- **Data ownership** — export per-child as JSON (full fidelity) or CSV,
  delete any entry, any child (cascades), or everything (account delete).
- **PWA** — installable to the home screen, app-shell cached for offline
  boot, manifest + maskable icons.

## Stack

| Layer     | Choice |
|-----------|--------|
| UI        | React 18 + TypeScript + Vite, Tailwind CSS |
| PWA       | `vite-plugin-pwa` (Workbox, autoUpdate) |
| State     | Zustand (client), no server-state library needed for v1 |
| Local DB  | IndexedDB via `idb` — the on-device source of truth |
| Backend   | Supabase (Postgres, Auth, RLS, Edge Functions) — optional |
| Sync      | LWW push/pull over Supabase, per-group watermarks |
| AI        | Supabase Edge Function doing RAG over pgvector corpus |
| Dates     | `date-fns` · Icons `lucide-react` |

## Getting started (local, no backend)

```bash
npm install
npm run icons      # generates PWA icons (already committed in public/icons)
npm run dev        # http://localhost:5173
```

Add a baby in onboarding and log care — it all works offline in IndexedDB.

### Production build

```bash
npm run build      # typecheck + build into dist/ (with sw.js)
npm run preview    # serve the production build
```

## Connecting sync + Barry (Supabase)

1. Create a project at [supabase.com](https://supabase.com) (or run
   `supabase start` with the CLI).
2. Apply the schema (SQL editor, or `supabase db push`):
   - `supabase/migrations/0001_init.sql` — tables, RLS, sync RPCs
   - `supabase/migrations/0002_barry_corpus.sql` — pgvector + Barry corpus
   The auth trigger creates each user a care group automatically on signup.
3. Copy `.env.example` → `.env` and fill in:
   ```
   VITE_SUPABASE_URL=https://<project>.supabase.co
   VITE_SUPABASE_ANON_KEY=<anon key>
   ```
4. Deploy Barry:
   ```bash
   supabase functions deploy barry --no-verify-jwt   # keep default auth on
   supabase secrets set \
     BARRY_BASE_URL="https://api.openai.com/v1" \
     BARRY_API_KEY="sk-..." \
     BARRY_MODEL="gpt-4o-mini" \
     BARRY_EMBEDDING_MODEL="text-embedding-3-small"
   ```
   - Any OpenAI-compatible `BARRY_BASE_URL` works (Ollama:
     `http://host:11434/v1`, etc.).
   - `BARRY_EMBEDDING_MODEL` is optional — without it Barry uses keyword
     search over the corpus. With it, the function transparently fills in
     the corpus embeddings on first use (rows are `vector(384)`; if your
     model embeds at a different dimension, recreate the column to match).
5. Rebuild (`npm run build`) so the new env vars are baked in.
   Sign in under **Settings → Sync** to start syncing across devices.

## How sync works

- **Local is the source of truth.** Every change writes to IndexedDB first,
  then schedules a debounced sync.
- **Push:** rows are upserted via `upsert_children` / `upsert_events`
  (guarded, last-write-wins on `updated_at`).
- **Pull:** the app pulls the group's rows, merges LWW locally, and stores a
  per-group watermark (newest `updated_at` seen).
- **Deletes are soft** (`deleted = true`) so they propagate to other devices;
  *Delete all my data* hard-deletes server-side and signs out.
- **Access control:** RLS + `group_members` — a user only ever sees their
  own care group's data.

## Project layout

```
src/
  lib/          types, config, IndexedDB, store (Zustand), sync, SweetSpot,
                Barry client, export utils
  components/   layout, child switcher, event form/card, SweetSpot, stats…
  pages/        Onboarding, Today, Log, Timeline, Barry, Settings
supabase/
  migrations/   0001_init.sql, 0002_barry_corpus.sql
  functions/barry/  RAG + streaming edge function (Deno)
scripts/        generate-icons.mjs
```

## Roadmap (beyond this pass)

- Weekly reports & charts (growth curves), reminders/alarms (Web Push)
- Voice entry (Web Speech) and photo capture on events
- Schedule creator
- Smartwatch / lock-screen / background-timer companions (native workstream)
