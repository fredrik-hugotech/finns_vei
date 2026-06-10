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
- `/map` also includes optional NVDB layer toggles for **Fartsgrense** and **Gangfelt** via server-side proxy endpoints.

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
  - `nvdb_status`: `enriched`, `not_found` or `failed`
  - `nvdb_enriched_at`
- If Trello env vars and a “Ny melding” list ID exist, `POST /api/report` creates a Trello card, stores `trello_card_id` and `trello_list_id`, and updates the card description with NVDB vegdata when enrichment completes. Trello failures are logged and do not fail report creation.
- Temporary debug endpoints for server-side production diagnosis:
  - `GET /api/debug/report?id=<report-id>&secret=<DEBUG_SECRET>` returns env booleans, latest NVDB status/note and Trello-ID presence without contact info or secret values.
  - `POST /api/debug/enrich?id=<report-id>&secret=<DEBUG_SECRET>` runs the same best-effort Trello/NVDB workflow for an existing report. If `DEBUG_SECRET` is set it is required; if not set, debug endpoints return `403` in production.
- `GET /api/nvdb/layer?type=speed_limit&bbox=minLng,minLat,maxLng,maxLat` returns Mapbox-friendly GeoJSON for fartsgrense.
- `GET /api/nvdb/layer?type=gangfelt&bbox=minLng,minLat,maxLng,maxLat` returns Mapbox-friendly GeoJSON for gangfelt.

## Existing Supabase resources

Expected server-side resources:

- `public.reports`
- `public.report_public_geojson`
- `public` bucket `report-images` for a later image-upload backlog item

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
| `DEBUG_SECRET` | Server secret | Recommended while debugging | Required query/header secret for temporary `/api/debug/*` endpoints. In production, debug endpoints are disabled with `403` if this is not set. |

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
