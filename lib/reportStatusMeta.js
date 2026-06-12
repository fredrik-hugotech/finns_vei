import { REPORT_STATUS } from './config';

// Status icons share a progress metaphor: empty ring -> dot -> half-filled -> done.
// They use currentColor so the same glyph works tinted in a popup pill and in the
// map colour inside the legend.
const STATUS_ICON = {
  ny: '<svg class="status-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2.4"/></svg>',
  registrert: '<svg class="status-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2.4"/><circle cx="12" cy="12" r="3.2" fill="currentColor"/></svg>',
  startet: '<svg class="status-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M12 4.4A7.6 7.6 0 0 1 12 19.6Z" fill="currentColor"/></svg>',
  fullfort: '<svg class="status-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="currentColor"/><path d="M8.2 12.4l2.6 2.6 5-5.4" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

export const REPORT_STATUS_META = {
  [REPORT_STATUS.NEW]: { key: 'ny', label: 'Ny', marker: '#F4C542', tint: '#FEF3C7', text: '#92400E', icon: STATUS_ICON.ny },
  [REPORT_STATUS.REGISTERED]: { key: 'registrert', label: 'Registrert', marker: '#F59E0B', tint: '#FFEDD5', text: '#B45309', icon: STATUS_ICON.registrert },
  [REPORT_STATUS.STARTED]: { key: 'startet', label: 'Startet', marker: '#2563EB', tint: '#DBEAFE', text: '#1D4ED8', icon: STATUS_ICON.startet },
  [REPORT_STATUS.DONE]: { key: 'fullfort', label: 'Fullført', marker: '#16A34A', tint: '#DCFCE7', text: '#15803D', icon: STATUS_ICON.fullfort },
};

const FALLBACK_META = { key: 'ukjent', label: 'Ukjent', marker: '#6B7280', tint: '#F3F4F6', text: '#374151', icon: STATUS_ICON.ny };

export const REPORT_STATUS_ORDER = [
  REPORT_STATUS.NEW,
  REPORT_STATUS.REGISTERED,
  REPORT_STATUS.STARTED,
  REPORT_STATUS.DONE,
];

export function reportStatusMeta(status) {
  return REPORT_STATUS_META[status] || { ...FALLBACK_META, label: status || 'Ukjent' };
}
