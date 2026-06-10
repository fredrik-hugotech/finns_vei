# Finns vei

Mobil web-kart for trafikksikkerhet: innbyggere kan trykke i Mapbox-kartet, melde inn et farlig punkt, lagre innmeldingen i Supabase og automatisk opprette Trello-kort for oppfølging.

## Funksjoner

- Mapbox GL-kart optimalisert for mobil.
- Klikk/trykk i kartet eller dra markøren for å velge posisjon.
- Innmeldingsskjema med kategori, alvorlighet, beskrivelse, sted/adresse og valgfri kontaktinfo.
- `GET /api/reports` leverer innmeldinger som GeoJSON til kartet.
- `POST /api/reports` validerer innmelding, lagrer i Supabase og oppretter Trello-kort når Trello-miljøvariabler er satt.
- Demo-markør vises lokalt hvis Supabase ikke er konfigurert.

## Miljøvariabler

Legg disse inn i Vercel Project Settings eller lokalt i `.env.local`. Ikke commit secrets.

| Variabel | Bruk |
| --- | --- |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | Offentlig Mapbox-token for klientkartet. |
| `SUPABASE_URL` | Supabase project URL. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side nøkkel for API-rutene. Alternativt kan `SUPABASE_ANON_KEY` brukes med riktig RLS-policy. |
| `SUPABASE_REPORTS_TABLE` | Valgfritt tabellnavn. Standard: `traffic_reports`. |
| `TRELLO_API_KEY` | Trello API key. |
| `TRELLO_API_TOKEN` | Trello API token. |
| `TRELLO_LIST_ID` | Trello-liste der nye kort skal opprettes. |

## Supabase-tabell

Eksempel på tabell for `traffic_reports`:

```sql
create extension if not exists pgcrypto;

create table if not exists public.traffic_reports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  lat double precision not null,
  lng double precision not null,
  category text not null,
  severity text not null,
  description text not null,
  address text,
  contact text,
  status text not null default 'Ny melding',
  source text not null default 'mobile-web-map',
  trello_card_id text,
  trello_card_url text
);

create index if not exists traffic_reports_created_at_idx on public.traffic_reports (created_at desc);
```

Hvis du bruker `SUPABASE_ANON_KEY`, slå på Row Level Security og legg til policies som passer for prosjektet. For Vercel serverless API er `SUPABASE_SERVICE_ROLE_KEY` enklest fordi nøkkelen bare brukes server-side.

## Lokal utvikling

```bash
npm install
npm run dev
```

Åpne <http://localhost:3000>.

## Deploy

Prosjektet er konfigurert for Next.js på Vercel. Koble repoet til Vercel-prosjektet `finns-vei`, legg inn miljøvariablene over og deploy branch/preview fra Vercel.
