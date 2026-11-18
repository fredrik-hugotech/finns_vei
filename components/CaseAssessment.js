import { EFFORT_TEXT, EffortChip, FinnAvatar, FinnProgress, UrgencyDots } from './Finn';
import SiteFacts from './SiteFacts';

// Everything known about a case, in one place: a clear verdict (urgent,
// low-hanging fruit, demanding …), Finn's proposal, the key facts from maps
// and registers, what stands out, the details and the next steps.

function verdicts(t, ctx) {
  const out = [];
  if (!t) return out;
  const kids = Number(ctx?.barn_6_15_1km) || 0;
  const vulnerable = (Number(ctx?.pedestrian_10y) || 0) + (Number(ctx?.cyclist_10y) || 0);
  const gap = Number(ctx?.site?.crossings?.crossing_gap_m) || 0;
  if (Number(t.urgency) >= 5 || (Number(t.urgency) >= 4 && (vulnerable > 0 || (kids >= 300 && gap > 300)))) {
    out.push({ key: 'haster', label: 'Haster', text: 'Alvorlig fare for barn. Bør tas først.' });
  }
  if (t.quick_win || t.effort === 'enkel') out.push({ key: 'lett', label: 'Lavthengende frukt', text: 'Enkelt tiltak som trolig løses med én henvendelse.' });
  if (t.effort === 'stor') out.push({ key: 'krevende', label: 'Krevende', text: 'Krever plan og budsjett hos veieier. Bygg saken over tid.' });
  if (t.effort === 'middels' && !out.some((v) => v.key === 'haster')) out.push({ key: 'middels', label: 'Middels innsats', text: EFFORT_TEXT.middels });
  if (t.needs_site_visit) out.push({ key: 'befaring', label: 'Trenger befaring', text: 'For vag til å vurdere uten å se stedet.' });
  return out;
}

// What stands out about the place, worst first.
function findings(ctx, aadt, speedLimit) {
  const out = [];
  if (!ctx) return out;
  const vulnerable = (Number(ctx.pedestrian_10y) || 0) + (Number(ctx.cyclist_10y) || 0);
  if (vulnerable) out.push(`${vulnerable} ${vulnerable === 1 ? 'ulykke' : 'ulykker'} med fotgjenger eller syklist innen 100 m siste 10 år.`);
  else if (ctx.count_10y) out.push(`${ctx.count_10y} personskadeulykke${ctx.count_10y === 1 ? '' : 'r'} innen 100 m siste 10 år.`);
  for (const f of ctx.site?.crossings?.flags || []) out.push(f);
  const road = ctx.site?.road || {};
  if (road.has_sidewalk === false && road.has_cycleway !== true && (Number(aadt) >= 1000 || Number(speedLimit) >= 50)) out.push('Ikke fortau eller gang- og sykkelveg der det er trafikk.');
  if (Number(aadt) >= 4000) out.push(`Mye trafikk: ÅDT ${Number(aadt).toLocaleString('nb-NO')}${road.heavy_share ? `, ${road.heavy_share} % tunge kjøretøy` : ''}.`);
  if (Number(ctx.barn_6_15_1km) >= 300) out.push(`Ca. ${Number(ctx.barn_6_15_1km).toLocaleString('nb-NO')} barn 6–15 år bor innen 1 km.`);
  const near = ctx.site?.near || {};
  if (Number(near.barnehagebarn) > 0) out.push(`${near.barnehager_antall} barnehage${near.barnehager_antall === 1 ? '' : 'r'} med ${near.barnehagebarn} barn innen 500 m.`);
  return out.slice(0, 6);
}

function Fact({ value, label, warn }) {
  return (
    <div className={warn ? 'ca-fact ca-fact--warn' : 'ca-fact'}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

export default function CaseAssessment({ c, triage: t, context: ctx, contactEmail }) {
  const v = verdicts(t, ctx);
  const f = findings(ctx, c.aadt, c.speed_limit);
  const cx = ctx?.site?.crossings;
  const road = ctx?.site?.road || {};
  const vulnerable = (Number(ctx?.pedestrian_10y) || 0) + (Number(ctx?.cyclist_10y) || 0);
  const num = (x) => (x == null ? '–' : Number(x).toLocaleString('nb-NO'));
  return (
    <section className="admin-section ca">
      <div className="ca-head">
        <FinnAvatar size={36} />
        <div>
          <span className="finn-kicker">Vurdering</span>
          <h2>{t ? t.measure : 'Finn har ikke vurdert saken ennå'}</h2>
        </div>
      </div>

      {v.length > 0 && (
        <div className="ca-verdicts">
          {v.map((x) => (
            <div key={x.key} className={`ca-verdict ca-verdict--${x.key}`}>
              <strong>{x.label}</strong>
              <span>{x.text}</span>
            </div>
          ))}
        </div>
      )}

      {t && (
        <div className="ca-finn">
          <div className="ca-finn__chips">
            <EffortChip effort={t.effort} />
            <UrgencyDots n={t.urgency} />
            <span className="ca-chip">{t.responsible}</span>
            <span className="ca-chip">{t.measure_type}</span>
          </div>
          {t.summary && <p className="ca-finn__summary">{t.summary}</p>}
          {t.rationale && <p className="ca-finn__why">{t.rationale}</p>}
        </div>
      )}

      <div className="ca-facts">
        <Fact value={ctx ? num(ctx.count_10y) : '–'} label="ulykker siste 10 år" warn={ctx?.count_10y > 0} />
        <Fact value={ctx ? num(vulnerable) : '–'} label="med fotgjenger/syklist" warn={vulnerable > 0} />
        <Fact value={num(c.aadt)} label={`ÅDT${c.speed_limit ? ` · ${c.speed_limit} km/t` : ''}`} warn={Number(c.aadt) >= 4000} />
        <Fact value={ctx?.barn_6_15_1km != null ? `ca. ${num(ctx.barn_6_15_1km)}` : '–'} label="barn 6–15 år innen 1 km" warn={Number(ctx?.barn_6_15_1km) >= 300} />
        <Fact value={cx?.crossing_gap_m != null ? `${cx.crossing_gap_m} m` : cx && !cx.error && cx.crossings_on_road === 0 ? 'Ingen' : '–'} label="mellom gangfelt" warn={Number(cx?.crossing_gap_m) > 300 || (cx && cx.crossings_on_road === 0)} />
        <Fact value={road.has_sidewalk == null ? '–' : road.has_sidewalk ? 'Ja' : (road.has_cycleway ? 'G/S-veg' : 'Nei')} label="fortau" warn={road.has_sidewalk === false && road.has_cycleway !== true} />
      </div>

      {f.length > 0 && (
        <div className="ca-findings">
          <h3>Dette skiller seg ut</h3>
          <ul>{f.map((x) => <li key={x}>{x}</li>)}</ul>
        </div>
      )}

      <details className="ca-details">
        <summary>Alle fakta om stedet: ulykker, kryssing, vegen, skoler, barnehager og idrett</summary>
        <SiteFacts context={ctx} aadt={c.aadt} speedLimit={c.speed_limit} embedded />
      </details>

      {t && Array.isArray(t.next_steps) && t.next_steps.length > 0 && (
        <div className="ca-next">
          <h3>Neste steg</h3>
          <ol>{t.next_steps.map((s) => <li key={s}>{s}</li>)}</ol>
        </div>
      )}
      <FinnProgress id={c.id} contactEmail={contactEmail} />
    </section>
  );
}
