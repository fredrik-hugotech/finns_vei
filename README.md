# Finns vei

Mobile-first webapp MVP for traffic-safety reports. People can report unsafe places without login, view reports on a Mapbox map, and let the server persist data in Supabase and optionally create Trello cards.

## MVP flow

- `/` shows two clear choices:
  - **Meld fra** → `/meld`
  - **Se kart** → `/map`
- `/meld` asks whether the report is from a child or adult:
  - **Meld som barn**: anonymous, no contact fields.
  - **Meld som voksen**: optional name, email and phone fields. All can be blank.
- `/meld/form` lets the user select a location by tapping the Mapbox map, dragging the marker, or pressing **Bruk min posisjon**.
- `/map` shows public report markers colored by status. Clicking a marker shows status, category, description and created time.

The MVP deliberately has no login, registration, badges, points, tracking, notifications or extra concepts.

## Backend/API

The frontend never reads Supabase directly. All reads and writes go through server-side Next.js API routes.

- `GET /api/reports` returns a GeoJSON `FeatureCollection` built from `public.report_public_geojson`.
- `POST /api/report` inserts into `public.reports` with:
  - `status`: `Ny`
  - `reporter_type`: `barn` or `voksen`
  - `category`, `description`, `lat`, `lng`
  - `contact_name`, `contact_email`, `contact_phone` only when `reporter_type` is `voksen`; otherwise they are stored as `null`.
- If Trello env vars and a “Ny melding” list ID exist, `POST /api/report` creates a Trello card and stores `trello_card_id` and `trello_list_id` back on the report row.

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

## Backlog

- Optional image upload to Supabase Storage bucket `report-images`.
- Admin-only workflow views for follow-up status changes.
