// Refreshes lib/skoler.json from Utdanningsdirektoratet's open school
// register (NSR): every active primary/lower-secondary school (grunnskole)
// in the given municipality, with coordinates. Run when schools change:
//   node scripts/hent-skoler.mjs 4204   (4204 = Kristiansand)
import fs from 'fs';

const kommune = process.argv[2] || '4204';
const list = await fetch(`https://data-nsr.udir.no/v3/enheter/kommune/${kommune}`).then((r) => r.json());
// Adult education (voksenopplæring) is registered as grunnskole too — not children.
const active = list.filter((x) => x.ErAktiv && x.ErSkole && x.ErGrunnskole && !/voksenoppl/i.test(x.Navn || ''));
const schools = [];
for (const s of active) {
  const d = await fetch(`https://data-nsr.udir.no/v3/enhet/${s.Orgnr}`).then((r) => r.json());
  const lat = Number(d?.Koordinat?.Breddegrad);
  const lng = Number(d?.Koordinat?.Lengdegrad);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
  schools.push({ orgnr: s.Orgnr, name: d.Navn, lat, lng, students: Number(d.Elevtall) || null });
}
schools.sort((a, b) => a.name.localeCompare(b.name, 'nb'));
fs.writeFileSync(new URL('../lib/skoler.json', import.meta.url), `${JSON.stringify({ kommune, source: 'Utdanningsdirektoratet, Nasjonalt skoleregister (data-nsr.udir.no)', fetched: new Date().toISOString().slice(0, 10), schools }, null, 1)}\n`);
console.log(`${schools.length} skoler lagret i lib/skoler.json`);
