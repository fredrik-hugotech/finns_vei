import { REPORT_STATUS } from './config';

// The "slik jobber vi videre"-checklist shown to the reporter. Which steps are
// ticked is driven by the case status set in backoffice.
export const PROCESS_STEPS = [
  'Melding mottatt',
  'Vi innhenter relevant saksinformasjon',
  'Vi kobler saken til andre meldinger i samme område',
  'Vi sjekker om det allerede er planlagt utbedring',
  'Vi melder saken til kommune og/eller fylkeskommune',
  'Du får varsling når utbedring/tiltak vedtas',
];

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
