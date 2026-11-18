// «Ulykker og trafikk» on a case: police-registered injury accidents within
// 100 m (NVDB), traffic (ÅDT, speed limit) and children nearby (schools).
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('nb-NO', { month: 'short', year: 'numeric' }) : '');

function trafficLabel(aadt) {
  const v = Number(aadt);
  if (!v) return null;
  if (v >= 10000) return 'svært mye trafikk';
  if (v >= 4000) return 'mye trafikk';
  if (v >= 1000) return 'middels trafikk';
  return 'lite trafikk';
}

export default function SiteFacts({ context: ctx, aadt, speedLimit }) {
  if (!ctx && !aadt && !speedLimit) return null;
  const items = ctx?.items || [];
  const vulnerable = (ctx?.pedestrian_10y || 0) + (ctx?.cyclist_10y || 0);
  return (
    <section className="admin-section site-facts">
      <h2>Ulykker og trafikk</h2>
      <div className="site-facts__nums">
        <div className={ctx?.count_10y ? 'site-facts__num site-facts__num--warn' : 'site-facts__num'}>
          <strong>{ctx ? ctx.count_10y : '–'}</strong>
          <span>ulykker siste 10 år</span>
        </div>
        <div className={vulnerable ? 'site-facts__num site-facts__num--warn' : 'site-facts__num'}>
          <strong>{ctx ? vulnerable : '–'}</strong>
          <span>med fotgjenger eller syklist</span>
        </div>
        <div className="site-facts__num">
          <strong>{aadt ? Number(aadt).toLocaleString('nb-NO') : '–'}</strong>
          <span>ÅDT{aadt ? ` · ${trafficLabel(aadt)}` : ''}</span>
        </div>
        <div className="site-facts__num">
          <strong>{ctx?.barn_6_15_1km != null ? `ca. ${Number(ctx.barn_6_15_1km).toLocaleString('nb-NO')}` : '–'}</strong>
          <span>barn 6–15 år bor innen 1 km</span>
        </div>
      </div>
      <p className="site-facts__line">
        {speedLimit ? `${speedLimit} km/t` : 'Fartsgrense ukjent'}
        {ctx?.nearest_school ? ` · nærmeste skole ${ctx.nearest_school} (${ctx.nearest_school_m} m)` : ''}
        {ctx?.students_1km ? ` · ${Number(ctx.students_1km).toLocaleString('nb-NO')} elever ved skoler innen 1 km` : ''}
        {ctx?.grunnkrets_navn ? ` · grunnkrets ${ctx.grunnkrets_navn} (${ctx.barn_6_15_grunnkrets} barn 6–15)` : ''}
        {ctx?.venues_500m ? ` · ${ctx.venues_500m} idrettsanlegg innen 500 m` : ''}
      </p>
      {(() => {
        const road = ctx?.site?.road || {};
        const near = ctx?.site?.near || {};
        const rows = [
          road.has_sidewalk != null && ['Fortau', road.has_sidewalk ? 'Ja, innen 30 m' : (road.has_cycleway ? 'Nei, men gang- og sykkelveg' : 'Nei'), road.has_sidewalk === false && road.has_cycleway !== true],
          road.crossings_100m != null && ['Gangfelt innen 100 m', road.crossings_100m ? `${road.crossings_100m} (nærmeste ${road.nearest_crossing_m} m)` : (road.crossing_in_network_30m ? 'I vegnettet like ved' : 'Ingen registrert'), road.crossings_100m === 0 && !road.crossing_in_network_30m],
          road.heavy_share != null && ['Tunge kjøretøy', `${road.heavy_share} % av trafikken`, Number(road.heavy_share) >= 10],
          road.speed_bumps_150m != null && ['Fartsdempere innen 150 m', String(road.speed_bumps_150m)],
          road.lights_50m != null && ['Lyspunkter innen 50 m', road.lights_50m ? String(road.lights_50m) : 'Ingen registrert'],
        ].filter(Boolean);
        return (
          <>
            {rows.length > 0 && (
              <div className="site-facts__road">
                {rows.map(([k, v, warn]) => <p key={k} className="sak-kv"><span>{k}</span><b className={warn ? 'site-facts__bad' : ''}>{v}</b></p>)}
              </div>
            )}
            {(near.skoler?.length > 0 || near.barnehager?.length > 0 || near.anlegg?.length > 0) && (
              <details className="site-facts__list">
                <summary>Skoler, barnehager og idrett i nærheten</summary>
                {near.skoler?.length > 0 && <><h4>Skoler innen 1 km</h4><ul>{near.skoler.map((x) => <li key={x.navn}><span className="site-facts__when">{x.m} m</span><span>{x.navn}<em>{x.elever != null ? `${x.elever} elever` : ''}</em></span></li>)}</ul></>}
                {near.barnehager?.length > 0 && <><h4>Barnehager innen 500 m ({near.barnehagebarn} barn)</h4><ul>{near.barnehager.map((x) => <li key={x.navn}><span className="site-facts__when">{x.m} m</span><span>{x.navn}<em>{x.barn != null ? `${x.barn} barn` : ''}</em></span></li>)}</ul></>}
                {near.anlegg?.length > 0 && <><h4>Idrettsanlegg innen 500 m</h4><ul>{near.anlegg.map((x) => <li key={`${x.navn}${x.m}`}><span className="site-facts__when">{x.m} m</span><span>{x.navn}<em>{x.type || ''}</em></span></li>)}</ul></>}
              </details>
            )}
          </>
        );
      })()}
      {items.length > 0 ? (
        <details className="site-facts__list" open={items.length <= 3}>
          <summary>{ctx.count_total} politiregistrerte personskadeulykker innen {ctx.radius_m} m</summary>
          <ul>
            {items.slice(0, 10).map((a) => (
              <li key={a.id}>
                <span className="site-facts__when">{fmtDate(a.date)}</span>
                <span>
                  {a.code || a.type || 'Ulykke'}
                  {(a.pedestrian || a.cyclist) && <b className="site-facts__tag">{a.pedestrian ? 'Fotgjenger' : 'Syklist'}</b>}
                  <em>{[a.light, a.speed ? `${a.speed} km/t` : null, a.dist_m != null ? `${a.dist_m} m unna` : null].filter(Boolean).join(' · ')}</em>
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : ctx ? (
        <p className="site-facts__none">Ingen politiregistrerte personskadeulykker innen {ctx.radius_m} m. Det betyr ikke at stedet er trygt; nestenulykker registreres ikke.</p>
      ) : (
        <p className="site-facts__none">Henter ulykkesdata …</p>
      )}
      <p className="site-facts__src">Kilder: Statens vegvesen (NVDB), SSB (barn per grunnkrets, anslag innen 1 km), skoleregisteret og Barnehagefakta. Gangfelt og lys på kommunale veger er ofte ikke registrert i NVDB.</p>
    </section>
  );
}
