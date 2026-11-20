import { getInsightSetting, knownPolitiloggenIncidents, saveTrafficIncidents, setInsightSetting } from './supabaseRest';
import { refreshTrafficIncidents } from './trafficIncidents';

const STATUS_KEY = 'trafikkhendelser_status';

export const incidentStore = {
  knownPolitiloggen: knownPolitiloggenIncidents,
  save: saveTrafficIncidents,
  setStatus: (s) => setInsightSetting(STATUS_KEY, JSON.stringify(s)),
};

export async function readIncidentStatus() {
  try { return JSON.parse(await getInsightSetting(STATUS_KEY)) || null; } catch (_e) { return null; }
}

export const refreshIncidents = () => refreshTrafficIncidents(incidentStore);
