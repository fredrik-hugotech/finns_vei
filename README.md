# Finns vei

Mobile-first webapp MVP for traffic-safety reports. People can report unsafe places without login, view reports on a Mapbox map, and let the server persist data in Supabase, enrich reports from NVDB and optionally create/update Trello cards.

## MVP flow

- `/` shows two clear choices:
  - **Meld fra** → `/meld`
  - **Se kart** → `/map`
- `/meld` asks whether the report is from a child or adult:
  - **Meld som barn**: anonymous, no contact fields.
  - **Meld som voksen**: optional name, email and phone fields. All can be blank.
- `/meld/form` lets the user select a location by tapping the Mapbox map, dragging the marker, or pressing **Bruk min posisjon**.
- `/map` shows public report markers colored by status. Clicking a marker shows status, category, description and created time.
- `/map` clusters public reports visually, sizes individual markers by `support_count`, and includes one optional NVDB layer toggle for **Ulykker**. Accident data only loads when the map is zoomed in enough.

The MVP deliberately has no login, registration, badges, points, tracking, notifications or extra concepts.

## Backend/API

The frontend never reads Supabase or NVDB directly. Reads and writes go through server-side Next.js API routes.

- `GET /api/reports` returns a GeoJSON `FeatureCollection` built from `public.report_public_geojson`.
- `POST /api/report` inserts into `public.reports` with:
  - `status`: `Ny`
  - `nvdb_status`: `pending`
  - `reporter_type`: `barn` or `voksen`
  - `category`, `description`, `lat`, `lng`
  - `contact_name`, `contact_email`, `contact_phone` only when `reporter_type` is `voksen`; otherwise they are stored as `null`.
- NVDB enrichment is best effort and is awaited inside `POST /api/report` after the Supabase insert because Vercel serverless functions cannot rely on fire-and-forget work after the response. Submission still succeeds if NVDB/Trello fails, but `nvdb_status` is resolved to `enriched`, `not_found` or `failed` with `nvdb_enriched_at` instead of staying `pending`. It updates these fields when available:
  - `road_owner`, `road_authority`, `road_category`, `road_number`, `road_reference`
  - `speed_limit`, `aadt`, `nearest_crossing_distance_m`
  - accident context summary only: `accident_count`, `accident_search_radius_m`, `nearest_accident_distance_m`, `accident_summary`
  - `nvdb_status`: `enriched`, `not_found` or `failed`
  - `nvdb_enriched_at`
- If Trello env vars and a “Ny melding” list ID exist, `POST /api/report` creates a Trello card, stores `trello_card_id` and `trello_list_id`, and updates the card description with NVDB vegdata when enrichment completes. Trello failures are logged and do not fail report creation.
- Temporary debug endpoints for server-side production diagnosis:
  - `GET /api/debug/report?id=<report-id>&secret=<DEBUG_SECRET>` returns env booleans, latest NVDB status/note and Trello-ID presence without contact info or secret values.
  - `POST /api/debug/enrich?id=<report-id>&secret=<DEBUG_SECRET>` runs the same best-effort Trello/NVDB workflow for an existing report. If `DEBUG_SECRET` is set it is required; if not set, debug endpoints return `403` in production.
- `POST /api/report-support` increments `support_count` for a report. The frontend uses local browser storage as a lightweight repeat-support guard; no login is required.
- `GET /api/nvdb/layer?type=accidents&bbox=minLng,minLat,maxLng,maxLat&zoom=13` returns Mapbox-friendly GeoJSON for traffic accidents. Other NVDB layers are kept server-capable but hidden from the public UI for now.

## Existing Supabase resources

Expected server-side resources:

- `public.reports`
- `public.report_public_geojson`
- `public` bucket `report-images` for a later image-upload backlog item

If accident/support columns or the support table are missing, add them with:

```sql
ALTER TABLE public.reports
ADD COLUMN IF NOT EXISTS accident_count integer,
ADD COLUMN IF NOT EXISTS accident_search_radius_m integer,
ADD COLUMN IF NOT EXISTS nearest_accident_distance_m numeric,
ADD COLUMN IF NOT EXISTS accident_summary jsonb DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS support_count integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.report_supports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  support_token text,
  ip_hash text,
  user_agent_hash text
);

CREATE INDEX IF NOT EXISTS report_supports_report_id_idx
ON public.report_supports(report_id);

CREATE UNIQUE INDEX IF NOT EXISTS report_supports_report_token_unique_idx
ON public.report_supports(report_id, support_token)
WHERE support_token IS NOT NULL;
```

Support stores a browser-generated token plus optional hashed IP/user-agent values only; raw IP addresses are never stored.

### Supporting with a voice (concern + note)

A support can carry an optional **concern** and **note** so a case becomes a collection of citizen voices, not just a `+1`. Each report popup aggregates these into round concern facets and a conversation thread. Add the columns with:

```sql
ALTER TABLE public.report_supports
ADD COLUMN IF NOT EXISTS note text,
ADD COLUMN IF NOT EXISTS category text;
```

`POST /api/report-support` accepts optional `note` and `category`. The code is resilient: if these columns are missing it still records the support (without the voice), so deploys never break support — but apply the migration to capture voices and facets. The public GeoJSON (`GET /api/reports`) then exposes `facets_json` (concern counts) and `voices_json` (supporter notes) per feature.

### Case grouping (one Trello card per place)

To avoid a Trello card per individual report, a new report within `CASE_GROUP_RADIUS_M` (default 35 m) of an existing open case (a report that already anchors a Trello card and is not `Fullført`) is linked to that case instead of creating a new card: it shares the anchor's `trello_card_id`/`trello_list_id`, gets `case_id` set to the anchor, and a comment is added to the anchor's Trello card. Grouped reports still enrich their own NVDB data in Supabase but do not overwrite the shared card description, and they move status together with the case via the Trello webhook.

```sql
ALTER TABLE public.reports
ADD COLUMN IF NOT EXISTS case_id uuid;

CREATE INDEX IF NOT EXISTS reports_case_id_idx ON public.reports(case_id);
```

The grouping is best-effort: without the `case_id` column reports are still linked by sharing the Trello card; with it, `case_id` ties the whole case together. Tune the radius with the optional `CASE_GROUP_RADIUS_M` env var.

Trello cards also link back to the public case (`<base>/sak/<caseId>`) and, as a case grows, the anchor card is renamed `Sak: <kategori> · N meldinger` for a quick overview. The base URL is taken from `PUBLIC_BASE_URL`/`NEXT_PUBLIC_SITE_URL`, falling back to Vercel's `VERCEL_PROJECT_PRODUCTION_URL`/`VERCEL_URL`. Set `PUBLIC_BASE_URL` to your production domain for stable links.

### Public status updates as a thread

Every `#public` Trello comment is appended to `public.report_status_updates` (keyed by the shared `trello_card_id`) so the case popup shows **each** Finns.Fairway reply as its own message in the conversation, in chronological order with the citizen voices — not just the latest. `public_status_note` is still updated as the latest note for backward compatibility and the share page.

```sql
CREATE TABLE IF NOT EXISTS public.report_status_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trello_card_id text NOT NULL,
  note text NOT NULL,
  source text DEFAULT 'trello_comment',
  trello_action_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS report_status_updates_card_idx
ON public.report_status_updates(trello_card_id, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS report_status_updates_action_unique_idx
ON public.report_status_updates(trello_action_id)
WHERE trello_action_id IS NOT NULL;

-- The API uses the service_role key. If a freshly created table is not granted
-- automatically (Supabase error 42501), grant access explicitly:
GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_status_updates TO service_role;
```

The unique index on `trello_action_id` makes webhook retries idempotent. The feature is best-effort: without the table, the popup falls back to the single `public_status_note`. The public GeoJSON exposes `updates_json` per feature.

## Children's cycling competitions

A competition module lets the municipality run challenges such as *"the club that
cycles to training the most times in August wins"*. Children log a bike trip with a
live **start/stop GPS tracker** (distance + duration, Strava-style) and tick whether
they wore a helmet. Each competition has a leaderboard (trips, kilometres and helmet
share) and an anonymous heatmap. The winning metric (`trips` or `distance`) is chosen
per competition in the backoffice.

**Privacy by design (children + GDPR):** raw GPS coordinates **never leave the
device**. While tracking, the phone records the route only to draw the live line and
compute distance. On stop, the device runs `clipAndSnapCells` (`lib/geoPrivacy.js`):
it removes the segments within ~150 m of the start *and* end (protecting home and the
exact destination), snaps the remainder to a coarse ~100 m grid, and uploads only that
**unordered set of cells** plus distance and duration. The published map is an
aggregated heatmap (per-cell counts) — no individual route is ever stored or shown.
No names are collected. The server re-snaps cells defensively in `createBikeTrip`.

- Public: `GET /api/competitions` (active list), `GET /api/competitions/[id]`
  (competition + leaderboard + heatmap GeoJSON), `POST /api/bike-trips` (log a trip:
  `{ competitionId, club, helmet, distanceM, durationS, cells }`).
- Backoffice: `GET/POST/PATCH /api/backoffice/competitions` (auth via
  `BACKOFFICE_SECRET`). Admin UI at `/backoffice/konkurranser?secret=…` to create
  competitions, define clubs (names only), pick the winning metric and show/hide them.

```sql
CREATE TABLE IF NOT EXISTS public.competitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  clubs jsonb NOT NULL DEFAULT '[]'::jsonb, -- [{ name }]
  starts_on date,
  ends_on date,
  helmet_focus boolean NOT NULL DEFAULT true,
  metric text NOT NULL DEFAULT 'trips',     -- 'trips' | 'distance'
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bike_trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id uuid NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
  club text,
  helmet boolean NOT NULL DEFAULT false,
  distance_m double precision,              -- total ridden distance (metres)
  duration_s integer,                       -- ride duration (seconds)
  path_cells jsonb NOT NULL DEFAULT '[]'::jsonb, -- clipped+snapped [lng,lat] cells (heatmap)
  trip_token text,                          -- anonymous per-browser token (light dedup)
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bike_trips_competition_idx
ON public.bike_trips(competition_id);

-- The API uses the service_role key. Grant access if Supabase reports 42501:
GRANT SELECT, INSERT, UPDATE, DELETE ON public.competitions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bike_trips TO service_role;
```

If you already created the v1 tables (with `origin_*`/`dest_*` columns), apply this
additive migration to enable GPS tracking + the per-competition metric:

```sql
ALTER TABLE public.competitions ADD COLUMN IF NOT EXISTS metric text NOT NULL DEFAULT 'trips';
ALTER TABLE public.bike_trips ADD COLUMN IF NOT EXISTS distance_m double precision;
ALTER TABLE public.bike_trips ADD COLUMN IF NOT EXISTS duration_s integer;
ALTER TABLE public.bike_trips ADD COLUMN IF NOT EXISTS path_cells jsonb NOT NULL DEFAULT '[]'::jsonb;
NOTIFY pgrst, 'reload schema';
```

The feature is additive — until the tables exist, `GET /api/competitions` simply
returns an empty list and the rest of the app is unaffected.

## Environment variables

Set these in Vercel Project Settings and locally in `.env.local` when developing. Do not commit secrets.

| Variable | Scope | Required | Purpose |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Server | Yes | Supabase project URL used by API routes. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server secret | Yes | Service role key for inserting reports and reading the public GeoJSON view server-side. |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | Browser | Yes | Mapbox GL JS token for map display and location selection. |
| `TRELLO_API_KEY` | Server secret | Optional | Trello API key. |
| `TRELLO_API_TOKEN` | Server secret | Optional | Trello API token. |
| `TRELLO_API_SECRET` | Server secret | Optional (`TRELLO_WEBHOOK_SECRET` also accepted) | Trello application secret used to verify the `X-Trello-Webhook` HMAC signature on incoming webhook POSTs. If unset, signature verification is skipped (logged once) so existing deploys keep working; set it to reject forged webhook requests. |
| `TRELLO_LIST_ID_NY_MELDING` | Server | Optional | Trello list ID for new reports. Falls back to `TRELLO_LIST_ID` if present. |
| `NVDB_X_CLIENT` | Server secret | Yes for production | Header value for NVDB API Les V4 identification. The server always sends an `X-Client` header and falls back to `finns-vei-vercel` locally. |
| `NVDB_BASE_URL` | Server | Optional | Primary NVDB API Les V4 base URL. Defaults to `https://nvdbapiles.atlas.vegvesen.no`. |
| `NVDB_FALLBACK_BASE_URLS` | Server | Optional | Comma-separated fallback base URLs if the primary URL has transient DNS/network issues. |
| `NVDB_RETRY_COUNT` | Server | Optional | Retry count per base URL for transient failures. Defaults to `2`. |
| `NVDB_TIMEOUT_MS` | Server | Optional | Timeout per NVDB request. Defaults to `6500`. |
| `NVDB_POSITION_MAX_DISTANCE_M` | Server | Optional | Max snap distance for NVDB position lookup. Defaults to `500` and retries at 100/300/500m. |
| `NVDB_LAYER_SEARCH_RADIUS_M` | Server | Optional | Radius used when looking up speed limit/ÅDT around a point after road-reference lookup. Defaults to `350`. |
| `NVDB_CROSSING_SEARCH_RADIUS_M` | Server | Optional | Radius used when finding nearest gangfelt. Defaults to `500`. |
| `NVDB_ACCIDENT_REPORT_RADIUS_M` | Server | Optional | Small radius used for per-report accident context. Defaults to `20`. |
| `NVDB_ACCIDENT_SEARCH_RADIUS_M` | Server | Optional | Broader radius used by accident map-layer lookups when needed. Defaults to `500`. |
| `NVDB_ACCIDENT_OBJECT_TYPE_ID` | Server | Optional | NVDB object type for traffic accidents. Defaults to `570` (`Trafikkulykke`) and can be overridden if the catalog changes. |
| `TRELLO_BOARD_ID` | Server | Optional | Trello board short ID used to auto-resolve the “Ny melding” list when no list ID is set. Defaults to `NNRJWwld`. |
| `TRELLO_LIST_NAME_NY_MELDING` | Server | Optional | Trello list name to resolve on the board. Defaults to `Ny melding`. |
| `DEBUG_SECRET` | Server secret | Recommended while debugging | Required query/header secret for temporary `/api/debug/*` endpoints. In production, debug endpoints are disabled with `403` if this is not set. |
| `SUPPORT_HASH_SALT` | Server secret | Optional | Salt for hashing IP/user-agent soft anti-spam values. Falls back to the Supabase service key if unset. |

## Product direction notes

- Trello is the backoffice workflow. Cards always include Report ID, Trello IDs are stored on `public.reports`, and future status sync should map `Ny melding -> Ny`, `Registrert -> Registrert`, `Startet -> Startet`, `Fullført -> Fullført`.
- Public map insight should focus on report density/support and accident context. Mapbox clustering is visual-only for now; future case grouping can use `road_reference`, category and a 25–50m distance threshold before introducing fields such as `case_group_id` or `cluster_key`.
- Accident counts in Trello use the small report radius (`NVDB_ACCIDENT_REPORT_RADIUS_M`) and should be read as “on/near the point”, not broad-area accident analysis.


## Map marker identity notes

- Report category icons live in `public/map-icons/` and are loaded as small static SVG assets for the Mapbox `reports-category-symbol` layer. They are intentionally simple monochrome placeholders in a Phosphor-inspired direction and can be replaced later with finalized licensed SVG assets using the same filenames.
- Category icon mapping is isolated in `lib/reportCategoryIcons.js`; unknown categories fall back to `other` and existing Supabase category values are not renamed.
- Future cluster improvements can use Mapbox `clusterProperties` to aggregate `support_count` into a `support_sum`, but current clusters intentionally remain report-count only.
- A future “Bekymringsgrad” heatmap can be based on reports, `support_count`, and category weighting. This phase does not add report heatmap layers.


## Backoffice status and AI suggestions

Trello is the internal backoffice workspace. Trello comments and AI output are private by default; public map text is only updated by explicit `#public` comments or by approving an AI suggestion through a protected endpoint.

Required report columns:

```sql
ALTER TABLE public.reports
ADD COLUMN IF NOT EXISTS status_updated_at timestamptz,
ADD COLUMN IF NOT EXISTS public_status_note text,
ADD COLUMN IF NOT EXISTS public_status_updated_at timestamptz,
ADD COLUMN IF NOT EXISTS public_status_source text,
ADD COLUMN IF NOT EXISTS ai_internal_summary text,
ADD COLUMN IF NOT EXISTS ai_public_status_suggestion text,
ADD COLUMN IF NOT EXISTS ai_priority_suggestion text,
ADD COLUMN IF NOT EXISTS ai_next_action_suggestion text,
ADD COLUMN IF NOT EXISTS ai_suggestion_updated_at timestamptz,
ADD COLUMN IF NOT EXISTS ai_suggestion_status text DEFAULT 'none',
ADD COLUMN IF NOT EXISTS ai_suggestion_note text;
```

Allowed `ai_suggestion_status` values are `none`, `draft`, `approved`, and `rejected`.

New optional environment variables:

| Variable | Scope | Default | Purpose |
| --- | --- | --- | --- |
| `BACKOFFICE_SECRET` | Server secret | falls back to `DEBUG_SECRET` | Protects internal backoffice AI endpoints. |
| `OPENAI_API_KEY` | Server secret | unset | Enables AI suggestion generation when backoffice AI is enabled. |
| `BACKOFFICE_AI_ENABLED` | Server | `false` | Must be `true` before `/api/backoffice/ai/suggest` will call OpenAI. |
| `BACKOFFICE_AI_MODEL` | Server | `gpt-5.2-mini` | OpenAI model used for suggestions. |
| `BACKOFFICE_AI_MAX_COMMENTS` | Server | `8` | Limits Trello actions/comments included in AI input, max 10. |
| `BACKOFFICE_AI_DAILY_LIMIT` | Server | unset | Reserved for future persisted usage limiting. |
| `BACKOFFICE_AI_REQUIRE_APPROVAL` | Server | `true` | Documents that AI suggestions require approval before publishing. |
| `BACKOFFICE_AI_TRELLO_COMMENT` | Server | `false` | If `true`, writes AI suggestions back to Trello as an internal “ikke publisert” comment. |

Trello webhook setup:

- Create a Trello webhook for board `NNRJWwld` using callback URL `https://<your-domain>/api/trello/webhook`.
- Trello verifies the callback with `HEAD /api/trello/webhook`, which returns `200`.
- `POST /api/trello/webhook` handles card moves between `Ny melding`, `Registrert`, `Startet`, and `Fullført` by updating `reports.status` and `status_updated_at` by `trello_card_id`.
- Normal Trello comments remain internal. Only comments starting with `#public` update `public_status_note`.
- Set `TRELLO_API_SECRET` (the Trello app secret paired with `TRELLO_API_KEY`, not the token) to verify the `X-Trello-Webhook` signature on each POST; without it, verification is skipped and a warning is logged once.

Backoffice AI endpoints:

- `GET /api/backoffice/ai/report?id=<report-id>&secret=<BACKOFFICE_SECRET>` returns safe internal suggestion fields only.
- `POST /api/backoffice/ai/suggest?id=<report-id>&secret=<BACKOFFICE_SECRET>` creates an AI draft and stores it in `ai_*` fields. It does not change `public_status_note`.
- `POST /api/backoffice/ai/approve-public-status?id=<report-id>&secret=<BACKOFFICE_SECRET>` copies the existing AI public suggestion to `public_status_note` and marks it approved.
- `POST /api/backoffice/ai/reject?id=<report-id>&secret=<BACKOFFICE_SECRET>` marks the suggestion rejected and does not change public map text.

Future batch mode can run nightly AI suggestions for cases with new Trello activity, many supports, or status changes. For now AI only runs when explicitly triggered by a protected backoffice endpoint.

## Local development

```bash
npm install
npm run dev
```

Open <http://localhost:3000>.

## Build

```bash
npm run build
```

## Deploy previews

This repo is intended to deploy through the linked Vercel GitHub integration. In local/Codex runtimes without the `@vercel` plugin or `VERCEL_TOKEN`, use the Vercel dashboard preview generated for the pushed branch/PR instead of claiming a local CLI deploy URL.

## Backlog

- Optional image upload to Supabase Storage bucket `report-images`.
- Admin-only workflow views for follow-up status changes.

## Report image uploads

The report form accepts up to three optional images and uploads them server-side to Supabase Storage.

Required Supabase setup for the MVP:

- Create a public Storage bucket named `report-images` (or set `SUPABASE_STORAGE_BUCKET_REPORT_IMAGES`).
- Ensure `public.reports.image_urls` exists as a `jsonb` array column.
- Recommended env defaults:
  - `SUPABASE_STORAGE_BUCKET_REPORT_IMAGES=report-images`
  - `REPORT_IMAGE_MAX_COUNT=3`
  - `REPORT_IMAGE_MAX_BYTES=8388608`

Images are stored under `reports/<report-id>/...` and `reports.image_urls` stores objects with `url`, `path`, `content_type`, and `size`. Trello card descriptions include image links, and the app best-effort attaches each public image URL to the Trello card. Report creation still succeeds if image upload or Trello attachment fails.

## Before/after resolution photo proof

When a case is fixed, staff can attach a resolution ("after") photo so the public case page shows a **Før / Etter** comparison next to the citizen's original ("before") photo — the core promise of the product made visible, not just a status label change.

Add the column with:

```sql
ALTER TABLE public.reports
ADD COLUMN IF NOT EXISTS resolution_image_urls jsonb DEFAULT '[]'::jsonb;
```

This follows the same `jsonb` array convention as `image_urls`, with an empty-array default (matching `bike_trips.path_cells` and `competitions.clubs` above), stored under `reports/<report-id>/resolution/...` in the same `report-images` bucket, as objects with `url`, `path`, `content_type`, and `size`.

- `POST /api/backoffice/resolution-image` (staff-only, same auth as other `/api/backoffice/*` endpoints) accepts a multipart upload of 1-3 images for a `reportId` and **appends** them to `reports.resolution_image_urls`, keeping at most `RESOLUTION_IMAGE_MAX_COUNT` (default: same as `REPORT_IMAGE_MAX_COUNT`, i.e. 3) most-recent photos.
- The backoffice case page (`/backoffice/sak/[id]`) has a "Legg til bilde av utbedring" upload control that calls this endpoint.
- The public case page (`/sak/[id]`) shows the Før/Etter section only when at least one resolution photo exists; existing cases without one render exactly as before — no empty section, no layout change.
- **Resilient by design, like `report_supports.note`/`category` above:** if `resolution_image_urls` hasn't been migrated onto a given Supabase deployment yet, the upload still succeeds (the photo is stored in the bucket) and the endpoint returns `200` with `db_saved: false` and a Norwegian `warning` explaining the migration is needed — it never 500s, and every existing request/response shape for reports without a resolution photo is unchanged.

New optional environment variable:

| Variable | Scope | Default | Purpose |
| --- | --- | --- | --- |
| `RESOLUTION_IMAGE_MAX_COUNT` | Server | Same as `REPORT_IMAGE_MAX_COUNT` (3) | Max resolution photos kept per report; older ones are dropped once the cap is hit. |

## Brand assets

The Finns Fairway brand mark (three dots) used for the favicon lives at `public/brand/finns-fairway-mark.svg`, and the in-app logo (mark + stacked “Finns Fairway” wordmark) is rendered by `components/Logo.js`. Brand colours and fonts are centralised in `styles/theme.css` (`--color-primary` deep green, cream background) and `pages/_app.js` (Poppins headings via `next/font`).
