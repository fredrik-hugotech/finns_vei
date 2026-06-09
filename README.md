# Finns vei 

Kartløsning for trafikksikkerhet.

## Mål
- Lage et interaktivt kart (Leaflet) med trafikkulykker/observasjoner.
- Filtrering på periode, ulykke-type (personskade, materielle skader), vegtype, kommune.
- Popups med detalj-info + lenker til kilder.
- Eksport/rapport for saksbehandling.

## Data
- Kilde: (sett inn når du har) CSV/GeoJSON per ulykke med felter:
  - id
  - lat
  - lng
  - datetime (ISO)
  - kommune
  - veg
  - kategori
  - alvorlighetsgrad
  - beskrivelse

## Teknologi
- Leaflet (statisk side i repo)
- Vercel for hosting (Production): https://finns-vei.vercel.app

## Neste steg
- Legg til `data/ulykker.geojson` + et lite UI for filtrering.
- Oppgradere til Next.js (valgfritt) om du trenger API-ruter, auth, eller server-side data.
