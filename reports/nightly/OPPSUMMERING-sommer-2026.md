# Sommeroppsummering — nattlig rutine 2026

**Periode:** 8. juli – 13. august 2026
**Kilde:** de 16 nattrapportene i `reports/nightly/` + `idea-backlog.md`
**Skrevet:** 14. august 2026

---

## Kortversjon

| Nøkkeltall | Verdi |
|---|---|
| Endringer deployet til produksjon | **74** |
| Netter som deployet noe | 12 (2.–13. aug) |
| Netter som kjørte, men bare bygde preview | 4 (8., 9., 10., 18. juli) |
| Pausevindu (ingen kjøring) | 18. juli – 1. aug |
| Fordeling | Backoffice 35 · Sikkerhet 20 · Ytelse 19 |
| Utenfor de tre tillatte områdene | 0 |

To regimer i sommer:
- **Før pausen (8.–18. juli):** gammelt opplegg — bygde kun isolerte preview-branches, rørte aldri `main`. Disse nettene deployet **ingenting** til prod (branchene ble merget senere).
- **Etter pausen (2.–13. aug):** innsnevret omfang (kun Sikkerhet/Ytelse/Backoffice) med stående fullmakt til å merge rett til `main` → prod. Alle disse nettene deployet.

Trenden er tydelig: antallet funn synker etter hvert som kodebasen «feies ren» (13 → 8 → … → 2 den 9. aug), og ytelses-agenten fant null nye funn flere av de siste nettene. Rutinen er disiplinert på å **ikke** auto-merge noe som krever et produktvalg — de samler seg som åpne punkter til deg (se nederst).

---

## Deploy per natt

| Dato | Til prod | Merknad |
|---|:---:|---|
| 08.07 | 0 | Preview-only (6 branches) |
| 09.07 | 0 | Preview-only (5 branches) |
| 10.07 | 0 | Preview-only (5 branches) |
| 18.07 | 0 | Preview-only; pause annonsert for påfølgende netter |
| — | — | **Pause 19.07 – 01.08** (ingen rapporter) |
| 02.08 | 12 | Første natt med direkte-til-prod |
| 03.08 | 13 | Høyest |
| 04.08 | 8 | Inkl. en kritisk rate-limit-bypass-fiks |
| 05.08 | 4 | Inkl. additiv DB-migrering kjørt live |
| 06.08 | 4 | |
| 07.08 | 7 | |
| 08.08 | 8 | |
| 09.08 | 2 | Lavest (ren feiing) |
| 10.08 | 3 | |
| 11.08 | 4 | |
| 12.08 | 4 | |
| 13.08 | 5 | |

---

## Hva ble gjort — gruppert

### 🔒 Sikkerhet (20)
- **Rate-limiting** var den største gjentakende jobben: lukket metodisk hvert endepunkt som manglet det, natt for natt (9 stab-/backoffice-ruter, cron, konkurranser, `GET /api/reports`, Trello-webhook, OG-bilderuter, `staff/me`, `aktuelt`, `staff/logout`). Innen 7. aug hadde alt en grense.
- **Kritisk fiks (4. aug):** rate-limiterne stolte på en forfalskbar `X-Forwarded-For` — som i praksis nullet ut *alle* grensene. Byttet til `x-real-ip`. (Gjorde alle grensene over reelle.)
- **Opplasting:** magic-byte signatursjekk på bilde-/vedleggsopplasting; UUID- og eksistenssjekk mot path traversal.
- **Sikkerhets-headere:** X-Frame-Options/nosniff/Referrer-Policy, deretter HSTS. (CSP gjenstår — se åpne punkter.)
- **Auth/sesjon:** passordbytte ugyldiggjør andre sesjoner; selvutlåsings-vern for superbruker + tetting av bypass-hull.
- Diverse: GPS-personvernradius rettet, NVDB bbox-tak, ingen lekkasje av rå backend-feil til anonyme, `nanoid`-patch.

### ⚡ Ytelse (19)
- **N+1/overflødige spørringer** fjernet: parallelle henteoperasjoner, `getStaffFromRequest` 2→1 kall, minimal `select` i stedet for hele rader flere steder.
- **TTL-caching** på backoffice triage-endepunkter (hotspots, hot-cases, competition-trips) + ferskhets-indikator.
- **TripTracker O(n²)-fikser:** løpende distanse-sum, throttlet live-rute.
- **Cache-Control/CDN** på `/sak/[id]` og konkurranser.
- **Mindre klientarbeid:** dashboard-memoisering, innsnevrede effekt-avhengigheter (stoppet gjentatt fakturert Mapbox-geokoding), klientside bildekomprimering.
- **DB-indekser** (additiv migrering kjørt live).

### 🛠️ Backoffice (35 — 47 %)
- **Skjemavalidering / busy-vern** (svært gjentakende): «deaktiver submit til feltene er gyldige» og dobbelttrykk-vern, gang på gang på «det siste skjemaet som manglet det».
- **Bekreftelse før irreversible handlinger:** slette/publisere vedlegg, offentlige notat, forhåndsvisning i bekreftelsen.
- **Storage-opprydding ved sletting:** vedleggsfiler, deretter innbygger-bilder (ærer «permanent»).
- **Advarsel ved avkuttede lister** (150/300/5000-tak som før var stille).
- **Dashboard-fliser dyplenker med filtre** (forfalt, ikke-tildelt, i dag, støtte).
- **Feiltekst normalisert til norsk** + konsistent respons-form.
- **Liste/søk:** filtre huskes, saks-ID søkbar, tetthets-modusvelger, klubb-leaderboard vist.
- **Stab/tildeling:** utlåsingsvern, inaktiv-tildeling vist, `status_updated_at`-stempling.
- Gjenopprettet ødelagt UI, konkurranse-datovalidering, tilgjengelighet.

---

## Fortsatt åpent (krever din vurdering)

Prioritert slik siste rapport bærer dem videre:

0. **GPS «hjem»-personvern (viktigst):** `/api/bike-trips` og `/api/report` stoler på klientens punkt-rekkefølge for å avgjøre hva som er «hjem» — en forfalsket POST kan publisere et barns nøyaktige hjemsted. Trenger en server-side avgjørelse.
1. **Manglende Content-Security-Policy** — bevisst utsatt (Mapbox GL / next-font / styled-jsx krever nøye allowlisting).
2. **AI-forslag prompt-injection** — innbyggertekst settes uescaped inn i OpenAI-prompt; henger sammen med AI-branchen under.
3. **Retur-tur personvern:** skal klippingen beskytte begge endepunkter, ikke bare start?
4. **AI-forslag-UI-branch** — bygget 2. aug, umerget i 12 netter, venter på produktvalg (OpenAI-kost, godkjenningsterskel, `OPENAI_API_KEY`).
5. listHotCases rangerings-bias + **konkurranse-redigering** mangler.
6. **Bruker-redigering** (navn/e-post/rolle) mangler; seed-spor skjult fra nav.
7. **Interne vedlegg** ligger i offentlig Supabase-bøtte uten objekt-tilgangskontroll → trenger privat bøtte + signerte URL-er.
8. Én foreldreløs `case_attachments`-rad i prod (destruktiv opprydding, ikke automatisert).
9. Kortløse saker kan ikke få Trello-kort i etterkant → får aldri interne notat/offentlige oppdateringer.
10. **Bekreft at `TRELLO_API_SECRET` og `CRON_SECRET` er satt i prod** (kan ikke sjekkes fra kode).
11. **Next.js 14→16-oppgradering** — de 2 høye `npm audit`-sårbarhetene (next + postcss) har vært åpne *hver natt* siden 8. juli; kun løsbart via en breaking major-oppgradering med full QA.
12. README mangler `CREATE TABLE`-seksjoner for `staff`, `staff_sessions`, `case_attachments`.
13. Slett to utdaterte bildekomprimerings-branches (erstattet av 4. aug-fiksen).

---

## Idé-backlog (skal IKKE bygges før du utvider omfanget igjen)

- Manuelt saks-sammenslåingsverktøy (backoffice).
- Myk sletting / «angre sletting».
- «Følg saken»: valgfri e-postvarsling ved statusendring (kan gjenbruke Resend-oppsettet).
- Flerspråklig meldeflyt (no/en+).
- «Story»-format 9:16 delbart bilde for Instagram/TikTok/Snap.
- Offentlig «forventet responstid»-tillitsindikator.
- «Skolevei»-kampanjemodus i konkurransemodulen.
- «Hot streets»-digest til kommunen / veimyndighet.
- Rydd i konkurrerende 17. juli-branches (staff-stats vs backoffice-statistikk; safest-school-route vs «Din vei»).

*(Merk: «bildekomprimering» i backloggen er allerede levert 4. aug — utdatert oppføring.)*
