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

### "Rett myndighet"-henvisning

Not every reported road belongs to the municipality: `road_category` is NVDB's raw `vegkategori` letter (`E`/`R` riksveg/europaveg, `F` fylkesveg, `K` kommunal veg, `P` privat veg, `S` skogsbilveg), and `road_owner`/`road_authority` hold the NVDB `vegforvalter` name when one exists, falling back to the same category inferred as text. `lib/roadAuthorityReferral.js` is a pure, client-safe helper (`classifyRoadAuthority`, `buildReferralDraft`) that reads these fields and, only for riksveg/europaveg (`Statens vegvesen`) and fylkesveg (kept generic as "fylkeskommunen" — no specific county is guessed), surfaces a **"Ikke kommunens vei"** card on `/backoffice/sak/[id]`. The card shows who is actually responsible and a short Norwegian explanation, plus a "generate referral" action that builds a pre-filled `mailto:` draft (case ID/link, category, description, location/vegreferanse, and a standard request text) with a copy-to-clipboard fallback of the same text. It never sends anything automatically — a human still reviews and sends it — and it deliberately does nothing for municipal, private/skogsbilveg, or not-yet-enriched roads so the common case stays uncluttered.

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
it removes the segments within ~50 m of the start (protecting home), snaps the
remainder to a coarse ~100 m grid, and uploads only that **unordered set of cells**
plus distance and duration. The published map is an aggregated heatmap (per-cell
counts) — no individual route is ever stored or shown. No names are collected.

The system never determines or stores what a child's true home coordinate is, not
even transiently. Every clip is anchored on a *randomly offset stand-in* for the
start (`randomOffsetPoint`), generated once client-side per trip and reused for the
whole trip — the raw first GPS fix is never itself used as the clip boundary's
center. `createBikeTrip` re-clips defensively server-side and, critically,
generates its **own independent** random offset around whatever the client
declares as the start rather than trusting or reusing the client's value — so the
actual protected zone is unpredictable to the client and can't be deliberately
placed a known-safe distance from. (Prior to 2026-08-18, both device and server
clipped around the literal claimed start point, which was `points[0]`, so anyone
skipping the on-device clip and POSTing straight to `/api/bike-trips` could place
the true start at an exactly-computable safe distance and have it survive.)

The stored route line (`bike_trips.path`, the ordered GPS trace behind the
Strava-style route rendering) is capped at `MAX_PATH_POINTS` (2026-08-23,
`lib/geoPrivacy.js`, default 3000) via Douglas-Peucker line simplification
applied inside `clipPath` — shared by both the on-device clip and
`createBikeTrip`'s server-side re-clip, so the cap holds even for a client
that skips it. Unlike truncating or fixed-interval decimation, this keeps
exactly the points where the route genuinely deviates (a shortcut off the
road, a different route than expected) and only drops redundant
near-collinear points from the ~1/s GPS fix rate, so route shape stays
accurate for staff review even after a long ride is reduced to a few
thousand points. Before this, nothing bounded path length at all — a long
ride (sessions up to `MAX_TRIP_DURATION_S`, 12h) could accumulate tens of
thousands of points and risk exceeding the API's request-body limit right
when the trip was saved. `path_cells` (the unordered heatmap grid, already
deduplicated to the ~100 m grid) is not affected — it stays naturally
bounded by route distance and grid size.

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

If you already created the trips table before walking mode and weather were added,
apply this additive migration too:

```sql
ALTER TABLE public.bike_trips ADD COLUMN IF NOT EXISTS mode text;
ALTER TABLE public.bike_trips ADD COLUMN IF NOT EXISTS weather_symbol text;
ALTER TABLE public.bike_trips ADD COLUMN IF NOT EXISTS precip_mm double precision;
ALTER TABLE public.bike_trips ADD COLUMN IF NOT EXISTS temp_c double precision;
ALTER TABLE public.bike_trips ADD COLUMN IF NOT EXISTS weather_bonus boolean NOT NULL DEFAULT false;
NOTIFY pgrst, 'reload schema';
```

If you already created the trips table before the clipped route line and
walking/school route type were added, apply this additive migration too:

```sql
ALTER TABLE public.bike_trips ADD COLUMN IF NOT EXISTS path jsonb, ADD COLUMN IF NOT EXISTS route_type text;
NOTIFY pgrst, 'reload schema';
```

The feature is additive — until the tables exist, `GET /api/competitions` simply
returns an empty list and the rest of the app is unaffected. The `mode`/weather/
`path`/`route_type` columns are additive in the same way: `createBikeTrip`
(`lib/supabaseRest.js`) retries the insert without them if the columns aren't
migrated yet, and `getCompetitionStats` falls back to a narrower `select` — so
trips keep logging and stats keep working either way, migrated or not.

## Recurring hotspot / seasonal-pattern overview

Backoffice staff can see which locations keep getting reported across *multiple different
seasons or years* — chronic problem spots — as distinct from spots that simply got many
reports during one short burst (e.g. a single bad week). This is a separate signal from
`/backoffice/hotteste` (open cases ranked by current support/engagement) and from the
~35 m `CASE_GROUP_RADIUS_M` case-grouping radius (which only links a *new* report to an
already-open Trello case).

- `lib/hotspotAnalysis.js` clusters the full `public.reports` history (any status, any
  age) purely in JS using the same haversine `distanceMeters` helper the bike-trip
  privacy code uses (`lib/geoPrivacy.js`) — there's no PostGIS/spatial index in this
  project, so no new dependency is introduced. Clustering is a simple greedy,
  chronological single-pass: each report joins the nearest existing cluster within
  `HOTSPOT_RADIUS_M` (default 75 m — roughly 2x the case-grouping radius, since this pass
  groups "same general spot over a long time span" rather than "same live case right
  now") or starts a new one.
- Each cluster is only surfaced as a "hotspot" once it has reports in at least
  `HOTSPOT_MIN_PERIODS` (default 2) distinct **meteorological seasons** (Norwegian
  vinter/vår/sommer/høst, with December grouped into the *following* winter so one whole
  winter only counts as one period). Ranking is by distinct-period count first, then
  report count — a spot with 6 reports across 3 different years ranks above 10 reports
  from one busy week, since that's the whole point of the feature.
- `GET /api/backoffice/hotspots` (admin-gated via `isAdminRequest`, same 403-first pattern
  as `/api/backoffice/hot-cases`) returns the ranked list: center point, report count,
  distinct-period count and labels, first/last-seen dates, dominant category, and status
  mix.
- `/backoffice/gjentakende-steder` renders the ranked list (linked from the dashboard
  shortcuts next to Hotteste saker) and links out to `/backoffice/sak/[id]` for one of the
  underlying reports at each spot. Shows a calm "ingen gjentakende steder funnet ennå"
  message on a young/sparse dataset instead of an error.
- Pure read/analysis: no schema changes, no new secrets, no writes.

Known first-version limitations: the clustering is greedy and order-dependent (a
cluster's centroid re-centers as members are added, so it can drift slightly rather than
staying pinned to one exact point); a report right at a season boundary (e.g. late
November vs. early December) can count as 2 distinct periods despite being only a few
weeks apart; and very close but genuinely distinct hotspots (e.g. two crossings 50 m
apart on the same street) can merge into one under the default radius.

| Variable | Scope | Default | Purpose |
| --- | --- | --- | --- |
| `HOTSPOT_RADIUS_M` | Server | `75` | Spatial clustering radius for the recurring hotspot overview. |
| `HOTSPOT_MIN_PERIODS` | Server | `2` | Minimum distinct seasons/years a spot must appear in to count as a recurring hotspot. |

## Staff accounts and case attachments

Three tables exist in Supabase but were previously undocumented here (doc gap
noted 2026-08-05, filled in 2026-08-18 from the live schema):

```sql
CREATE TABLE IF NOT EXISTS public.staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  name text,
  role text NOT NULL DEFAULT 'staff',   -- 'staff' | 'superuser'
  password_hash text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.staff_sessions (
  token text PRIMARY KEY,
  staff_id uuid NOT NULL REFERENCES public.staff(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS public.case_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL,              -- no FK constraint in production
                                         -- today (see note below)
  url text NOT NULL,
  path text,
  content_type text,
  filename text,
  visibility text NOT NULL DEFAULT 'internal', -- 'internal' | 'public'
  size integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

`staff` backs email/password login (`lib/staffAuth.js`, scrypt hashing) and
role-gated actions (`role = 'superuser'` for user management). `staff_sessions`
is the cookie-session store; `getStaffFromRequest` opportunistically deletes a
row once it's found expired, in addition to explicit logout. `case_attachments`
backs `pages/api/backoffice/attachment.js` and the attachment list on
`/backoffice/sak/[id]` — see "Report image uploads" above for the similar,
separate `reports.image_urls` mechanism used for the original report photos.

**Storage (2026-08-18):** `visibility: 'public'` attachments live in the same
public `report-images` bucket as report photos, at a permanent URL. Until
2026-08-18, `visibility: 'internal'` attachments lived there too — same
bucket, only a database column marking them "internal", with no actual
access control: anyone with (or guessing) the storage URL could read a
staff-only attachment directly, bypassing `isAdminRequest` entirely. Internal
attachments now live in a separate **private** Supabase Storage bucket
(`case-attachments-internal`, `public: false`), never reachable by a plain
URL. `lib/supabaseRest.js`'s `bucketForVisibility()` is the single place that
decides which bucket a given visibility uses; `listCaseAttachments()` signs a
fresh, 1-hour-expiry URL for every internal row on each read
(`getSignedStorageUrl`) instead of storing a permanent one (internal rows
store `url: null`). Toggling visibility (`setCaseAttachmentVisibility`)
physically moves the file between buckets — download + re-upload + delete,
since Storage has no built-in cross-bucket move — and only updates the DB row
once the move succeeds.

Note: `case_attachments.report_id` has **no foreign key constraint** to
`reports.id` in production today, so nothing prevents an attachment row from
outliving its report (confirmed: one such orphaned row exists, from
2026-07-07, `visibility: 'public'` — see the Backlog entry below). A future
migration could add `REFERENCES public.reports(id) ON DELETE CASCADE`, but
that's additive schema work, not part of this doc-only pass.

## Database indexes (performance)

`public.staff_sessions` (staff login sessions, keyed by `token`) — see the
"Staff accounts and case attachments" section above for its full schema. Its
`staff_id` foreign key had no covering index; `reports` lacked indexes on the
columns actually used to filter/sort it outside `status`/`category`/`case_id`.
Applied directly to the Supabase project (additive, safe to re-run):

```sql
CREATE INDEX IF NOT EXISTS reports_trello_card_id_idx ON public.reports(trello_card_id);
CREATE INDEX IF NOT EXISTS reports_created_at_idx ON public.reports(created_at DESC);
CREATE INDEX IF NOT EXISTS reports_lat_lng_idx ON public.reports(lat, lng);
CREATE INDEX IF NOT EXISTS staff_sessions_staff_id_idx ON public.staff_sessions(staff_id);
CREATE INDEX IF NOT EXISTS case_attachments_report_idx ON public.case_attachments(report_id);
```

`reports_trello_card_id_idx` backs every Trello webhook delivery and grouped-report
write (`countReportsByTrelloCard`, `updateReportByTrelloCardId`); `reports_created_at_idx`
backs the `order=created_at.desc` used across most backoffice lists;
`reports_lat_lng_idx` supports the `CASE_GROUP_RADIUS_M` bounding-box scan run on
every `POST /api/report` (a plain btree, not a spatial index — fine at today's
volume, but a real bounding-box/PostGIS index would be needed if `reports` grows
much larger). `case_attachments_report_idx` backs `listCaseAttachments()`'s
`report_id=eq.<id>` lookup, hit from both the backoffice case workspace and the
public, unauthenticated `report-thread` endpoint (confirmed already present in
production 2026-08-24; documented here to close a doc gap, not newly added).
`getStaffFromRequest` (`lib/staffAuth.js`) also now deletes a
`staff_sessions` row opportunistically once it's found expired, instead of only
ever removing rows on explicit logout.

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
| `NVDB_PAGINATION_BUDGET_MS` | Server | Optional | Overall wall-clock budget for following `metadata.neste.href` pagination on a layer query (see below). Defaults to `12000`. Pagination stops (keeping whatever was fetched so far) once this elapses, even if under the object-count cap. |
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
- One orphaned `case_attachments` row exists in production (id
  `602bf453-0eba-4a62-82e5-52597c64583c`, `report_id`
  `d9bf626e-c5c2-4a2c-82f0-76d37045ad74`, `visibility: 'public'`, created
  2026-07-07) — its `reports` row no longer exists. Confirmed via direct
  query 2026-08-18. Deliberately not deleted automatically (destructive);
  delete it manually when convenient, or add the missing FK constraint
  noted above first so this can't recur.
- `case_attachments.report_id` has no FK constraint to `reports.id` (see
  above) — an additive migration to add one is safe to do whenever
  convenient, no rush.

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

Internal-visibility case attachments (`/backoffice/sak/[id]`) additionally
require a **private** Storage bucket named `case-attachments-internal` (or
set `SUPABASE_STORAGE_BUCKET_CASE_ATTACHMENTS_INTERNAL`), created with
`public: false` — see "Staff accounts and case attachments" above.

## Brand assets

The Finns Fairway brand mark (three dots) used for the favicon lives at `public/brand/finns-fairway-mark.svg`, and the in-app logo (mark + stacked “Finns Fairway” wordmark) is rendered by `components/Logo.js`. Brand colours and fonts are centralised in `styles/theme.css` (`--color-primary` deep green, cream background) and `pages/_app.js` (Poppins headings via `next/font`).
