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
- `POST /api/report-support` records a row in `report_supports`, syncs `reports.support_count`, and returns duplicate supports as `alreadySupported`. The frontend uses local browser storage plus a browser token as the main repeat-support guard; the server also stores hashed IP/user-agent fingerprints as a lightweight soft anti-spam guard. No login is required.
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

## Environment variables

Set these in Vercel Project Settings and locally in `.env.local` when developing. Do not commit secrets.

| Variable | Scope | Required | Purpose |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Server | Yes | Supabase project URL used by API routes. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server secret | Yes | Service role key for inserting reports and reading the public GeoJSON view server-side. |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | Browser | Yes | Mapbox GL JS token for map display and location selection. |
| `TRELLO_API_KEY` | Server secret | Optional | Trello API key. |
| `TRELLO_API_TOKEN` | Server secret | Optional | Trello API token. |
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
