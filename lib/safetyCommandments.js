// Finns Fairway's "10 bud for trygg ferdsel til og fra idrett".
// Static content — reused across the app (no database). The first five speak
// to children (shown as a rotating tip after each trip); 6–10 are for adults.
export const SAFETY_COMMANDMENTS = [
  { n: 1, audience: 'barn', title: 'Følg trafikkreglene', text: 'Akkurat som på idrettsbanen er det regler i trafikken. Bruk gangfelt og vent på grønt lys – men se deg alltid for.' },
  { n: 2, audience: 'barn', title: 'Vær oppmerksom', text: 'I idrett må du følge med for å ta gode valg. I trafikken må du også se og lytte etter hva som skjer rundt deg.' },
  { n: 3, audience: 'barn', title: 'Bruk riktig utstyr', text: 'Hjelm beskytter hodet – bruk den når du sykler eller kjører sparkesykkel. Og ta beltesjekken når du sitter på.' },
  { n: 4, audience: 'barn', title: 'Pass på hverandre', text: 'Et godt lag sørger for at alle er med. Gå eller sykle sammen, og se til at alle kommer trygt frem.' },
  { n: 5, audience: 'barn', title: 'Hold deg på riktig side', text: 'Bruk fortau og gang- og sykkelvei der du kan. Uten fortau: gå på venstre side, sykle på høyre der det er tryggest.' },
  { n: 6, audience: 'voksen', title: 'Hold fartsgrensen når du kjører', text: 'Stress gir dårligere resultat – på banen og i trafikken. Planlegg så dere slipper hastverk, og ta ingen unødvendige sjanser.' },
  { n: 7, audience: 'voksen', title: 'Forbered barna på gode vaner', text: 'En god oppvarming forebygger idrettsskader. Gode vaner i trafikken forebygger alvorlige skader.' },
  { n: 8, audience: 'voksen', title: 'Rett antall i bilen', text: 'Ingen stiller med for mange spillere på banen. Alle skal ha eget sete og bilbelte – uansett hvor kort turen er.' },
  { n: 9, audience: 'voksen', title: 'Tiden rundt økten teller', text: 'Lagfølelsen starter før økten. Oppmuntre barn og foresatte til å gå eller sykle sammen – trygghet og gode vaner.' },
  { n: 10, audience: 'voksen', title: 'Samarbeid gir trygghet', text: 'Idrett handler om samspill. Vis hensyn, slipp frem myke trafikanter, og unngå å slippe av barn i trafikkerte områder ved anlegget.' },
];

export const KID_COMMANDMENTS = SAFETY_COMMANDMENTS.filter((b) => b.audience === 'barn');

// Post-trip mini quiz content (BudQuiz component): one true/false statement pair
// per kid commandment. `true` is an accurate paraphrase of the bud (the correct
// fact shown in "Nesten! Husk: ..." feedback), `false` is a plausible-sounding
// but wrong opposite. Picking which variant to *ask* about happens at random in
// the component so the same bud can surface either phrasing across sessions.
export const KID_QUIZ = [
  {
    n: 1,
    true: 'Du skal se deg for selv når det er grønt mann.',
    false: 'Det er greit å løpe rett ut i veien uten å se deg for, så lenge det er grønt mann.',
  },
  {
    n: 2,
    true: 'I trafikken bør du se og lytte etter hva som skjer rundt deg.',
    false: 'Det spiller ingen rolle om du hører biler når du går langs veien.',
  },
  {
    n: 3,
    true: 'Du bør bruke hjelm når du sykler eller kjører sparkesykkel.',
    false: 'Hjelm trenger du bare når du driver idrett, ikke når du sykler.',
  },
  {
    n: 4,
    true: 'Det er lurt å gå eller sykle sammen med andre og se til at alle kommer trygt frem.',
    false: 'Det beste er at alle går hver sin vei uten å bry seg om de andre kommer trygt frem.',
  },
  {
    n: 5,
    true: 'Uten fortau bør du gå på venstre side av veien.',
    false: 'Uten fortau spiller det ingen rolle hvilken side av veien du går på.',
  },
];
