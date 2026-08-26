import { REPORT_STATUS } from './config';

// The "slik jobber vi videre"-checklist shown to the reporter. Which steps are
// ticked is driven by the case status set in backoffice.
//
// De to siste punktene ble omformulert 2026-08-26 (Fredrik, direkte
// tilbakemelding): Finns Fairway er et sted vi lagrer og organiserer
// meldinger — noen videresendes til rett myndighet, men vi kan verken love
// at en gitt sak faktisk sendes videre, eller at den fører til et konkret
// tiltak/en utbedring. De gamle tekstene ("Vi melder saken til kommune...",
// "Du får varsling når utbedring/tiltak vedtas") ga et løfte vi ikke kan
// holde for hver enkelt sak. Se også CASE_DONE_MESSAGE under, som tidligere
// sa "Saken er ferdig behandlet" (impliserer fysisk utbedret) i stedet for
// "avsluttet hos oss" (impliserer bare at vår egen saksbehandling er ferdig).
export const PROCESS_STEPS = [
  'Melding mottatt og lagret',
  'Vi innhenter relevant saksinformasjon',
  'Vi kobler saken til andre meldinger i samme område',
  'Vi sjekker om det allerede er planlagt utbedring',
  'Aktuelle saker videresendes til kommune og/eller fylkeskommune',
  'Vi oppdaterer saken her dersom vi får ny informasjon',
];

// Vist i stedet for "Neste: …" når alle steg er krysset av (status
// Fullført). Samme grunn som over: sier at VÅR saksbehandling er avsluttet,
// ikke at det utrygge stedet faktisk er utbedret — det kan vi ikke vite.
export const CASE_DONE_MESSAGE = 'Saken er avsluttet hos oss.';

// How many steps are done for a given status:
//   Ny         → 1 (melding mottatt)
//   Registrert → 3 (the first three)
//   Startet    → 5
//   Fullført   → 6 (all)
export function completedStepCount(status) {
  switch (status) {
    case REPORT_STATUS.DONE: return 6;
    case REPORT_STATUS.STARTED: return 5;
    case REPORT_STATUS.REGISTERED: return 3;
    default: return 1;
  }
}

export function processStepsForStatus(status) {
  const done = completedStepCount(status);
  return PROCESS_STEPS.map((label, index) => ({ label, done: index < done }));
}

// Compact progress summary for the case box (popup / case page): how far the
// case has come, the current step and the next one.
export function caseProgress(status) {
  const total = PROCESS_STEPS.length;
  const done = completedStepCount(status);
  const nextStep = done < total ? PROCESS_STEPS[done] : null;
  return {
    done,
    total,
    percent: Math.round((done / total) * 100),
    current: PROCESS_STEPS[Math.max(0, done - 1)],
    next: nextStep,
  };
}
