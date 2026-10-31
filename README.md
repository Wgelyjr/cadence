# Cadence

Track everything your baby needs — sleep, feeds, diapers, growth, milestones,
solid foods, and (when you're closer to due date) labor contractions.
Cadence is an **installable, offline-first PWA**: it works fully on-device,
and syncs across phones and caregivers when you connect a backend.

> Cadence is a care-tracking tool, not a medical device and not a medical
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

## Docker: full local stack & deploy

One command brings up the PWA **and** a self-contained local Supabase
(Postgres, Auth, PostgREST, Realtime, Storage, Edge Functions, Studio):

```bash
make setup         # or: bash scripts/setup-docker.sh
```

You get:

| What         | Where |
|--------------|-------|
| Cadence (installable PWA) | http://localhost:8088 |
| Supabase Studio | http://localhost:8000 (user/password in `docker/supabase/.env`) |
| API gateway (kong) | http://localhost:8000 |
| Postgres (via pooler) | localhost:5432 (user `postgres`) |
| SearXNG (Barry's web search) | http://localhost:8888 (`SEARXNG_PORT` in root `.env`) |

What `make setup` does:

1. Generates `docker/supabase/.env` — fresh random secrets, and
   `ANON_KEY` / `SERVICE_ROLE_KEY` JWTs signed with that random
   `JWT_SECRET` (re-runnable: existing `.env` files are kept).
2. Generates the root `.env` and points `VITE_SUPABASE_URL` /
   `VITE_SUPABASE_ANON_KEY` at the local stack (never overwrites values
   you set by hand).
2b. Syncs the env files (`scripts/sync-env.sh`) — see below.
3. Syncs `supabase/functions/*` (Barry) into the edge-runtime volume.
4. `docker compose up -d --build` — builds the web image with the local
   URL + anon key baked in.
5. Waits for Postgres, kong, Auth, the edge runtime, and the web app to
   be healthy, then applies `supabase/migrations/*.sql` (idempotent — the
   schema can't run at DB first-init because it references `auth.users`,
   which the auth service creates at boot).

Day to day:

```bash
make up            # (re)build + start
make logs          # tail everything
make ps            # status
make migrate       # re-apply migrations (safe)
make deploy-barry  # after changing Barry: sync + restart edge runtime
make down          # stop (data kept in docker/supabase/volumes + volumes)
make reset         # stop + destroy all local data
```

**Barry with Docker:** put your LLM endpoint in the root `.env`
(uncomment the `BARRY_*` lines — any OpenAI-compatible endpoint works,
including local Ollama/LM Studio/vLLM), then `make setup` again (or
`make deploy-barry`). Without it, the app is fully usable and Barry shows
an offline notice.

Barry also grounds general answers in live web search and cites its
sources: the `searxng` container (JSON API, limiter off —
`docker/searxng/settings.yml`) runs with the stack and the edge function
queries it at `http://searxng:8080`. Point `BARRY_SEARXNG_URL` in the root
`.env` at a different instance if you have one; if SearXNG is down, Barry
silently falls back to notes + recorded data.

**How the env files work:** Docker Compose interpolates `${VAR}` from the
**project root's `.env` only** — it does not read `docker/supabase/.env`.
So the setup script generates the stack secrets into
`docker/supabase/.env` (which also keeps the pinned stack runnable
standalone from its own directory) and mirrors every stack variable into a
managed block at the end of the root `.env`. Your BARRY_* values go the
other way (root → stack file). `scripts/sync-env.sh` re-does this on every
`make setup` / `make up`, which is why the make targets are the supported
entry points — a bare `docker compose up` works too, as long as a setup or
`make up` ran first. Don't edit the managed block in the root `.env` (it
is overwritten); edit `docker/supabase/.env` and re-run `make up`.

**Troubleshooting:**

- *Many services fail at start (postgres "password is not specified",
  postgrest/realtime/supavisor crash-loop, kong never healthy):* the stack
  was started before `make setup` generated the `.env` files, so every
  secret was blank. Fix: if the database was already initialized with
  those blank secrets, `make reset` (destroys local data) and then
  `make setup`.
- *"port is already allocated":* something else uses 8000/8443/5432/6543/8088.
  Change `KONG_HTTP_PORT` / `KONG_HTTPS_PORT` / `POSTGRES_PORT` /
  `POOLER_PROXY_PORT_TRANSACTION` / `WEB_PORT` in the root `.env`, then
  `make setup` + `make up`.
- *"The container name /supabase-… is already in use":* leftovers from
  another compose project. `docker rm -f $(docker ps -aq --filter "label=com.docker.compose.project=babyapp")`,
  or just `make reset`.
- *Services crash-loop with OOM kills:* the full stack wants ~4–6 GB of
  RAM. Raise the Docker daemon's memory limit (Docker Desktop: Settings →
  Resources).
- *Studio asks for a password:* user/password are in
  `docker/supabase/.env` (`DASHBOARD_USERNAME` / `DASHBOARD_PASSWORD`).

**Deploying to a server:** the same compose project runs as-is — set
`KONG_HTTP_PORT`, `WEB_PORT`, `SUPABASE_PUBLIC_URL`, `API_EXTERNAL_URL`
and `SITE_URL` in `docker/supabase/.env` (then re-run `make setup` or
`make up` to propagate them), put a TLS-terminating reverse proxy
(Caddy/nginx) in front, and run `make up`. The Supabase stack is a pinned
copy of the official self-hosted stack (tag `v1.26.08`) in
`docker/supabase/`, so upgrades are a deliberate, reviewed change rather
than a silent drift.

**Hosted Supabase instead of Docker:** skip this section — see below.

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
docker/
  Dockerfile        web image (Vite build → nginx, SPA + PWA cache rules)
  nginx/            nginx config (sw.js no-cache, hashed assets immutable)
  supabase/         pinned self-hosted Supabase stack (tag v1.26.08)
docker-compose.yml  root project: web + included supabase stack
scripts/
  generate-icons.mjs
  setup-docker.sh     env generation, build, up, health waits, migrations
  apply-migrations.sh (re)apply supabase/migrations (idempotent)
  sync-functions.sh   supabase/functions/* → edge-runtime volume
Makefile          make setup / up / down / logs / migrate / reset …
```

## Roadmap (beyond this pass)

- Weekly reports & charts (growth curves), reminders/alarms (Web Push)
- Voice entry (Web Speech) and photo capture on events
- Schedule creator
- Smartwatch / lock-screen / background-timer companions (native workstream)
