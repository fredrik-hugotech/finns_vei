import { classifyReports } from './aiAssist';
import { setMainCategories } from './supabaseRest';

// Gives reports a main category (Finn), 25 at a time.
export async function categorizeReports(reports, { returnMap = false } = {}) {
  let done = 0;
  const all = new Map();
  for (let i = 0; i < reports.length; i += 25) {
    const batch = reports.slice(i, i + 25);
    const { items } = await classifyReports(batch);
    const byN = new Map(items.map((it) => [it.n, it.category]));
    const rows = batch.map((r, k) => ({ id: r.id, main_category: byN.get(k + 1) })).filter((r) => r.main_category);
    await setMainCategories(rows);
    rows.forEach((r) => all.set(r.id, r.main_category));
    done += rows.length;
  }
  return returnMap ? all : done;
}
