import { REPORT_STATUS } from './config';

// The "slik jobber vi videre"-checklist shown to the reporter. Which steps are
// ticked is driven by the case status set in backoffice.
export const PROCESS_STEPS = [
  'Melding mottatt',
  'Vi innhenter relevant saksinformasjon',
  'Vi kobler saken til andre meldinger i samme område',
];
// Only steps we can actually stand behind. (Removed 2026-10-15: checking for
// planned improvements, reporting to kommune/fylkeskommune and notifying the
// reporter about decisions — not something Finns Fairway can promise.)

// How many steps are done for a given status:
//   Ny                              → 1 (melding mottatt)
//   Registrert, Startet, Fullført   → all three
export function completedStepCount(status) {
  switch (status) {
    case REPORT_STATUS.DONE:
    case REPORT_STATUS.STARTED:
    case REPORT_STATUS.REGISTERED:
      return PROCESS_STEPS.length;
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
