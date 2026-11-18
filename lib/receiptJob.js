import { buildReceipt, placeFor } from './receipt';
import { getReportById, saveReceipt } from './supabaseRest';
import { FALLBACK_CATEGORY } from './mainCategories';

// Makes and stores the fixed receipt for one report.
export async function makeReceipt(reportOrId, mainCategory = null) {
  const report = typeof reportOrId === 'string'
    ? await getReportById(reportOrId, { select: 'id,lat,lng,main_category' })
    : reportOrId;
  if (!report) return null;
  const place = await placeFor({ lat: report.lat, lng: report.lng }).catch(() => ({ road: null, kommune: null }));
  const text = buildReceipt({ mainCategory: mainCategory || report.main_category || FALLBACK_CATEGORY, place });
  await saveReceipt(report.id, { receipt_text: text, place_road: place.road, place_kommune: place.kommune });
  return text;
}
