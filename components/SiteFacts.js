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
          <strong>{ctx?.students_1km != null ? Number(ctx.students_1km).toLocaleString('nb-NO') : '–'}</strong>
          <span>elever innen 1 km</span>
        </div>
      </div>
      <p className="site-facts__line">
        {speedLimit ? `${speedLimit} km/t` : 'Fartsgrense ukjent'}
        {ctx?.nearest_school ? ` · nærmeste skole ${ctx.nearest_school} (${ctx.nearest_school_m} m)` : ''}
        {ctx?.venues_500m ? ` · ${ctx.venues_500m} idrettsanlegg innen 500 m` : ''}
      </p>
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
      <p className="site-facts__src">Kilde: Statens vegvesen (NVDB). Elevtall fra skoleregisteret.</p>
    </section>
  );
}
