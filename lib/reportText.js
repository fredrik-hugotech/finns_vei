// A report that ticks several categories is stored with a first line like
// "Gjelder: Farlig skolevei, Utrygt kryss, Høy fart." before the reporter's
// own text. splitReportText() separates that line so screens can show the
// categories as labels and the reporter's words as text. `exclude` drops the
// category already shown as the title.
const CATEGORY_LINE = /^\s*Gjelder:\s*([^\n]*?)\.(?:\s*\r?\n|\s+|$)/;

export function splitReportText(description, { exclude = null } = {}) {
  const raw = String(description || '');
  const m = raw.match(CATEGORY_LINE);
  if (!m) return { categories: [], text: raw.trim() };
  const categories = m[1].split(',').map((c) => c.trim()).filter(Boolean)
    .filter((c, i, all) => all.indexOf(c) === i)
    .filter((c) => !exclude || c !== exclude);
  return { categories, text: raw.slice(m[0].length).trim() };
}
