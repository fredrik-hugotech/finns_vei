import { claudeJson } from './aiAssist';
import { categoryPhrase } from './mainCategories';
import { placeFor, placePhrase } from './receipt';

// Finn's fact-based message to the person who reported. The facts are put
// together here, by code, from what we know about the place (the GIS analysis:
// accidents, traffic, the road, crossings, children, schools, kindergartens,
// sports venues, bus stops). Finn only writes a short, personal text from
// them. It must inform, never propose measures and never promise anything on
// behalf of Finns.Fairway — the text is checked, and a fixed line with the
// sources is added.

const n = (v) => (v == null ? null : Number(v));
const fmt = (v) => Number(v).toLocaleString('nb-NO');

export function gatherFacts({ report, ctx, linkedCount = 0 }) {
  const f = [];
  const support = n(report.support_count) || 0;
  if (linkedCount > 0) f.push(`${linkedCount + 1} meldinger om dette stedet er samlet i saken.`);
  if (support > 0) f.push(`${support} personer har støttet saken.`);
  if (ctx) {
    if (ctx.count_total > 0) {
      const vuln = (n(ctx.pedestrian_10y) || 0) + (n(ctx.cyclist_10y) || 0);
      f.push(`Statens vegvesen har registrert ${ctx.count_total} personskadeulykke${ctx.count_total === 1 ? '' : 'r'} innen 100 meter, ${ctx.count_10y} av dem de siste 10 årene${vuln ? `, og ${vuln} av disse involverte fotgjenger eller syklist` : ''}${ctx.latest_date ? `. Den siste var i ${String(ctx.latest_date).slice(0, 4)}` : ''}.`);
    } else {
      f.push('Statens vegvesen har ikke registrert personskadeulykker innen 100 meter. Nestenulykker blir ikke registrert.');
    }
  }
  if (n(report.aadt)) f.push(`Om lag ${fmt(report.aadt)} kjøretøy passerer i snitt per døgn (ÅDT, Statens vegvesen)${ctx?.site?.road?.heavy_share != null ? `, og ${ctx.site.road.heavy_share} prosent er lange kjøretøy` : ''}.`);
  if (n(report.speed_limit)) f.push(`Fartsgrensen er ${report.speed_limit} km/t.`);
  const road = ctx?.site?.road || {};
  if (road.has_sidewalk === true) f.push('Det er registrert fortau like ved.');
  else if (road.has_sidewalk === false && road.has_cycleway) f.push('Det er ikke registrert fortau like ved, men det er gang- og sykkelveg.');
  else if (road.has_sidewalk === false) f.push('Det er ikke registrert fortau eller gang- og sykkelveg like ved.');
  const cx = ctx?.site?.crossings;
  if (cx && !cx.error && cx.road_ref !== undefined) {
    if (!cx.crossings_on_road) f.push('Det er ikke registrert gangfelt på vegen innen 500 meter.');
    else if (cx.crossing_gap_m != null) f.push(`Det er om lag ${cx.crossing_gap_m} meter mellom de nærmeste registrerte gangfeltene på hver side av stedet.`);
    else f.push(`Nærmeste registrerte gangfelt på vegen ligger om lag ${cx.crossing_ahead_m ?? cx.crossing_behind_m} meter unna, og det er ikke registrert gangfelt i motsatt retning innen 500 meter.`);
    const stops = (cx.destinations || []).filter((d) => d.type === 'Bussholdeplass');
    if (stops.length) f.push(`Bussholdeplass${stops.length > 1 ? 'er' : ''} i nærheten: ${stops.slice(0, 3).map((s) => `${s.navn} (${s.m} m${s.crossing_m != null ? `, ${s.crossing_m} m fra nærmeste gangfelt` : ''})`).join(', ')}.`);
  }
  if (ctx?.barn_6_15_1km != null) f.push(`Om lag ${fmt(ctx.barn_6_15_1km)} barn i alderen 6–15 år bor innen 1 km (SSB, anslag).`);
  const near = ctx?.site?.near || {};
  if (near.skoler?.length) f.push(`Skoler innen 1 km: ${near.skoler.slice(0, 3).map((s) => `${s.navn} (${s.m} m${s.elever ? `, ${s.elever} elever` : ''})`).join(', ')}.`);
  if (near.barnehager?.length) f.push(`${near.barnehager_antall} barnehage${near.barnehager_antall === 1 ? '' : 'r'} innen 500 meter med til sammen ${near.barnehagebarn} barn.`);
  if (near.anlegg?.length) f.push(`Idrettsanlegg innen 500 meter: ${near.anlegg.slice(0, 3).map((a) => `${a.navn} (${a.m} m)`).join(', ')}.`);
  return f;
}

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['message'],
  properties: { message: { type: 'string', description: 'Selve meldingen, 70–140 ord, i 2–3 korte avsnitt. Uten hilsen og navn til slutt.' } },
};

// Things the text must never say: promises, plans, advice or measures.
const FORBIDDEN = [
  /\b(vi|finns\.?\s?fairway|stiftelsen)\b[^.!?]{0,50}\b(skal|vil|kommer til å|forbereder|sender|ber\b|tar kontakt|følger opp|jobber med|jobbe videre|lover|sørger|oppdaterer|kontakter|melder fra|tar saken)/i,
  /\b(anbefal\w*|bør|tiltak\w*|foreslå\w*|løsning\w*|må\s+(bygges|etableres|fikses|utbedres)|trengs\b)/i,
  /\b(oppdatere?r?\s+(her|deg)|hører fra oss|gir beskjed)\b/i,
];
const violates = (t) => FORBIDDEN.find((re) => re.test(t));

const SYSTEM = `Du er Finn i Finnsvei. Du skriver en kort, personlig melding til en som har meldt fra om et utrygt sted for barn. Meldingen legges ut på saken deres.
Formålet er bare å informere om hva vi vet om stedet. Bruk faktaene du får, med tall, og si gjerne at de stemmer med det innbyggeren har pekt på når de gjør det. Ikke vurder hvor farlig stedet er, og ikke dramatiser.
Absolutte regler:
- Ikke foreslå tiltak, løsninger eller endringer på stedet. Ikke bruk ordene «tiltak», «bør», «anbefaler», «foreslår».
- Ikke lov noe, og ikke beskriv hva Finns.Fairway, kommunen eller andre skal gjøre videre. Ikke skriv «vi skal», «vi vil», «vi sender», «vi følger opp», «vi oppdaterer».
- Bruk bare faktaene i lista. Ikke finn på noe, og ikke gjengi innbyggerens tekst eller navn.
- Start med en kort, vennlig innledning som nevner stedet, for eksempel «Vi har sett nærmere på stedet du meldte fra om …».
- Skriv på norsk bokmål, kort og tydelig. Er melderen et barn, skriv enkelt.`;

export async function writeFactMessage({ report, ctx, linkedCount = 0 }) {
  const place = report.place_road || report.place_kommune
    ? { road: report.place_road, kommune: report.place_kommune }
    : await placeFor({ lat: report.lat, lng: report.lng }).catch(() => ({ road: null, kommune: null }));
  const facts = gatherFacts({ report, ctx, linkedCount });
  if (facts.length < 2) throw new Error('For lite fakta om stedet til å skrive en melding');
  const intro = `Melding om ${categoryPhrase(report.main_category)}${placePhrase(place) ? ` ${placePhrase(place)}` : ''}. Meldt av ${report.reporter_type === 'barn' ? 'et barn' : 'en voksen'}.`;
  let feedback = '';
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { data, model } = await claudeJson({
      system: SYSTEM,
      user: `${intro}\n\nFakta om stedet:\n${facts.map((x) => `- ${x}`).join('\n')}${feedback}`,
      schema: SCHEMA,
      effort: 'low',
      maxTokens: 2500,
    });
    const text = String(data.message || '').trim();
    const bad = violates(text);
    if (text && !bad) {
      const closing = 'Opplysningene er hentet fra Statens vegvesen, SSB, skoleregisteret og Barnehagefakta.';
      return { message: `${text}\n\n${closing}`, facts, model };
    }
    feedback = `\n\nForrige utkast brøt reglene (${bad ? String(bad).slice(0, 60) : 'tom tekst'}). Skriv på nytt uten å foreslå, love eller beskrive videre arbeid.`;
  }
  throw new Error('Finn klarte ikke å skrive en melding uten lovnader');
}
