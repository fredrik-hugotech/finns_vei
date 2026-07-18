# Idé-backlogg (produkt/kreativt — utenfor sikkerhet/ytelse/backoffice)

Opprettet 2026-07-18 da den nattlige rutinens omfang ble innsnevret til kun
sikkerhet, ytelse og backoffice-forbedringer (se `CLAUDE.md`). Ideer utenfor
det omfanget skal fra nå av samles her i stedet for å bygges, og tas opp igjen
når Fredrik sier fra at det nattlige omfanget skal utvides tilbake.

Format per idé: kort beskrivelse, hvorfor den er relevant, grovt omfang, og
hvilken natt/kilde den først kom fra.

---

## Fra tidligere netters "foreslått, ikke bygget"-lister (samlet 2026-07-18)

- **Manuelt sak-sammenslåingsverktøy i backoffice.** La stab slå sammen to
  saker den automatiske ~35 m-grupperingen bommet på. *(NB: dette er egentlig
  et backoffice-forbedringsforslag og kan trygt tas opp igjen tidligere enn
  resten av lista under, innenfor det nye omfanget.)* Foreslått 07-11, 07-12.
  Middels omfang — berører sakslivssyklus, ansvarlig Trello-kort, støttetall.

- **Myk sletting / "Angre sletting"** for hard sak-slette-funksjonen i
  backoffice. *(Også reelt et backoffice-forslag, kan tas opp tidligere.)*
  Krever et bevisst valg om angre-vindu/lagringsmodell (`deleted_at`-kolonne
  vs. midlertidig buffer).

- **"Følg saken": valgfritt e-postvarsel ved statusendring.** Foreslått hver
  natt siden 07-10, alltid notert som blokkert av behov for ekstern
  e-post-tjeneste/hemmelighet. En urapportert branch fra 07-17
  (`nightly/2026-07-17/case-status-email-follow`, fortsatt usammenslått) ser
  ut til å ha løst det ved å gjenbruke det eksisterende Resend-oppsettet fra
  daglig e-postoppsummering i stedet for en ny hemmelighet — verdt å sjekke
  når produktideer tas opp igjen.

- **Flerspråk-veksling for meldeflyten** (norsk/engelsk, ev. flere). Krever et
  bevisst valg om hvilke språk som prioriteres. Middels omfang.

- **"Story"-format delbart bilde (9:16)** for Instagram/TikTok/Snapchat,
  utvider dagens OG-bilde og "Del bekymringen"-seksjonen. Liten/middels
  omfang, ingen ny hemmelighet.

- **Offentlig, aggregert "forventet responstid"-tillitsindikator** på
  kvitterings-/sakssiden. Bygger på eksisterende intern saksalder-logikk.

- **Bildekomprimering før opplasting i meldeskjemaet.** Reell UX-svakhet på
  trege mobilnett. Krever bibliotekvalg + fremdrifts-UI. Det finnes allerede
  en usammenslått branch fra 07-16 (`nightly/2026-07-16/bildekomprimering`) —
  sjekk den før noe bygges på nytt.

- **"Skolevei"-kampanjemodus i konkurransemodulen.** Utvider
  konkurranse-/sykkelsporingsmodulen med en egen kampanjetype for
  skoleruter. Stort/tverrgående, krever et bevisst produktvalg om
  kampanje-modellen.

- **"Hot streets"-digest til kommunen.** Periodisk oppsummering av
  høyest-prioriterte steder pushet til en kommunekontakt. Krever ekstern
  e-post-tjeneste eller et valg om intern visning.

- **Bulk "saker på denne veien"-digest for riktig veimyndighet.** Utvider
  kveldens "Rett myndighet"-henvisning (07-18) fra én sak til en samlet,
  delbar oversikt for en hel vei/strekning.

## Urapporterte/duplikate branches fra 07-17 (avklar før bygging)

- `nightly/2026-07-17/staff-stats-dashboard` og
  `nightly/2026-07-17/backoffice-statistikk` er to konkurrerende
  implementasjoner av samme idé (internt statistikk-dashboard) — velg én, ikke
  begge, når det tas opp.
- `nightly/2026-07-17/safest-school-route` overlapper med den usammenslåtte
  "Din vei"/skolevei-sjekk-funksjonen fra 07-16 — avklar forholdet mellom dem
  før videre bygging.

## Fra 07-18-natten spesifikt (kreativ idérunde, ikke prioritert i natt)

Se `reports/nightly/2026-07-18.md`, seksjonen "Foreslått, ikke bygget", for
full kontekst på alle punktene over pluss begrunnelser.
