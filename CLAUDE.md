# Instrukser for dette repoet

Dette er standing-instruksjoner for alle Claude Code-økter i `finns_vei`,
inkludert den automatiserte nattlige gjennomgangs-/byggerutinen. Les denne filen
først. Sist oppdatert 2026-07-18 av Fredrik (fredrik@hugo.as), gjeldende til den
endres igjen.

## Nattlig automatisert rutine — gjeldende status

**PAUSET til og med 2026-08-01.** Om en nattlig automatisert kjøring trigges i
dette vinduet (2026-07-18 til 2026-08-01): ikke bygg, ikke lag branches, ikke
deploy. Sjekk kun raskt om det er noe *kritisk* (aktivt utnyttbar
sikkerhetssvakhet på produksjon) — finnes det, varsle Fredrik med en push-
notification og vent på respons i stedet for å bygge/merge automatisk, siden den
utvidede automatiske merge-fullmakten under kun gjelder utenfor pause-vinduet.
Ellers: ikke gjør noe, ikke skriv rapport, avslutt stille. (Merk: denne
instruksen kan ikke stoppe selve trigger-mekanismen på plattformnivå — den
ligger utenfor det Claude Code har verktøytilgang til å endre fra denne
sesjonen. Sjekk ev. Claude Code on the web sine trigger-innstillinger for
repoet om du ønsker rutinen fysisk avskrudd i tillegg til denne
instruksjonsbaserte pausen.)

## Nattlig rutine — nytt omfang fra og med 2026-08-02

Etter pausen er den nattlige gjennomgangen **innsnevret til kun tre områder**:

1. **Sikkerhet** — reelle sårbarheter (XSS, injeksjon, auth-hull, manglende
   rate-limiting, lekkasje av data/hemmeligheter, osv.)
2. **Ytelse** — N+1-spørringer, ubegrensede henteoperasjoner, manglende
   caching/indeksering, unødvendig klientarbeid.
3. **Forbedringer i backoffice** — stabens interne verktøy
   (`/backoffice/**` og tilhørende API-ruter), IKKE den offentlige,
   borgervendte appen.

**Kreative produktideer, nye borgervendte funksjoner og alt annet utenfor disse
tre områdene skal IKKE bygges lenger inntil videre.** Blir de likevel oppdaget
under gjennomgangen (de vil ofte dukke opp naturlig), skal de **kun logges** i
`reports/nightly/idea-backlog.md` (opprettet i natt, se der for format og
allerede kjente ideer) — ikke bygges, ikke branches, ikke previews. De tas opp
igjen når Fredrik selv sier fra at det nattlige omfanget skal utvides tilbake,
ikke automatisk etter en bestemt dato.

### Bygg- og merge-fullmakt (nytt, gjelder kun de tre områdene over)

For funn/fikser **innenfor** sikkerhet, ytelse eller backoffice har den
nattlige rutinen nå stående fullmakt til å bygge, verifisere og **merge direkte
til `main` og dermed til produksjon** (Vercels Git-integrasjon deployer `main`
automatisk til `finnsvei.no`) — **uten** å vente på at Fredrik manuelt
godkjenner en preview-branch først, og uten å spørre om tillatelse for selve
handlingen "merge til main og prod" for disse tre kategoriene spesifikt.

Dette er et bevisst, avgrenset unntak fra den generelle regelen om at
automatiserte økter aldri skal røre `main`/prod uten eksplisitt godkjenning —
unntaket gjelder **kun** sikkerhet/ytelse/backoffice, ikke noe annet.

Fortsatt ufravikelig, også for disse tre kategoriene:
- `npm ci` + `npm run build` MÅ være grønt før noe merges — både på den enkelte
  branchen og på den kombinerte `main` etter merge (bygg én gang til etter
  siste merge, før push).
- Bygg fortsatt hver endring på en egen, isolert `nightly/<dato>/<slug>`-branch
  først (git-historikk/sporbarhet), merge den branchen inn i `main` når bygget
  er grønt, i stedet for å committe direkte på `main`.
- Ingen destruktive databasemigrasjoner (kun additive, samme praksis som før).
- Ingen hemmeligheter i commits.
- Ingen `vercel --prod`-kommando kjøres manuelt — produksjonsdeploy skjer kun
  via det vanlige `git push` til `main` gjennom Vercels eksisterende
  Git-integrasjon, aldri en manuell prod-deploy-kommando.
- Skriv fortsatt en kort natt-rapport i `reports/nightly/<dato>.md` (på en egen
  `nightly/<dato>/report`-branch, merget inn på samme måte) som oppsummerer hva
  som faktisk ble merget/deployet til produksjon den natten — dette er nå
  viktigere enn før, siden endringene går rett til prod uten at Fredrik ser en
  preview først. Send fortsatt en push-notification med sammendrag på slutten
  av hver kjøring.
- Om en foreslått sikkerhets-/ytelses-/backoffice-fiks er stor, tvetydig, eller
  krever et produktvalg (f.eks. endrer synlig oppførsel på en måte som kan
  overraske, eller krever en ekstern hemmelighet) — behandle den som før:
  bygg branch + preview, men **ikke** merge automatisk, beskriv den i
  rapporten og vent på Fredriks vurdering. Den utvidede fullmakten gjelder
  trygge, mekaniske og tydelig-i-scope fikser, ikke tvilstilfeller.
- Alt utenfor de tre kategoriene (uansett hvor god idéen er): kun logg i
  `reports/nightly/idea-backlog.md`, aldri bygg.

## Generelt for dette repoet

Se `README.md` for produkt-/arkitekturkontekst (datamodell, alle API-ruter,
miljøvariabler, personvernprinsipper for sykkelkonkurranse-sporing osv.) —
les den før større endringer.
