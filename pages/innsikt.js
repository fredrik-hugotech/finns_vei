import Head from 'next/head';
import { useCallback, useEffect, useRef, useState } from 'react';
import Logo from '../components/Logo';
import { CumulativeChart, ColumnChart, RankBars, SplitBar, INSIGHT_COLORS, useHourLabels } from '../components/InsightCharts';

// Finnsvei in numbers, for everyone at Finns.Fairway. Behind a shared password
// (set by a superuser) or a staff login. Only aggregated figures are shown.
function HeatMap({ points }) {
  const ref = useRef(null);
  useEffect(() => {
    let map;
    let cancelled = false;
    (async () => {
      const mapboxgl = (await import('mapbox-gl')).default;
      await import('mapbox-gl/dist/mapbox-gl.css');
      const { attachMapFallback } = await import('../lib/mapFallback');
      const { applyLocalLabelNames } = await import('../lib/mapLabels');
      if (cancelled || !ref.current) return;
      mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';
      map = new mapboxgl.Map({
        container: ref.current,
        style: 'mapbox://styles/mapbox/light-v11',
        bounds: [[4.6, 57.9], [31.2, 71.2]],
        fitBoundsOptions: { padding: 16 },
        attributionControl: false,
        cooperativeGestures: true,
      });
      attachMapFallback(map, { initialOnly: true });
      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
      map.on('load', () => {
        applyLocalLabelNames(map);
        map.addSource('pts', { type: 'geojson', data: { type: 'FeatureCollection', features: points.map((c) => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: c } })) } });
        map.addLayer({
          id: 'heat',
          type: 'heatmap',
          source: 'pts',
          paint: {
            'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 3, 0.7, 8, 1.2, 12, 2],
            'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 3, 7, 6, 12, 10, 20, 13, 28],
            'heatmap-opacity': 0.85,
            'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'],
              0, 'rgba(11,93,77,0)', 0.1, 'rgba(120,190,165,0.55)', 0.35, '#3f8f7b', 0.65, '#0b5d4d', 1, '#05352b'],
          },
        });
      });
    })();
    return () => { cancelled = true; if (map) map.remove(); };
  }, [points]);
  return <div className="ins-map" ref={ref} aria-label="Kart over hvor det er meldt fra" />;
}

function Gate({ onDone }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const r = await fetch('/api/innsikt/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setError(d.error || 'Feil passord.'); return; }
      onDone();
    } catch (_e) { setError('Noe gikk galt.'); } finally { setBusy(false); }
  };
  return (
    <main className="ins-gate">
      <form className="ins-gate__card" onSubmit={submit}>
        <Logo size="md" />
        <h1>Finnsvei i tall</h1>
        <p>For alle i Finns.Fairway. Skriv inn passordet du har fått.</p>
        <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Passord" aria-label="Passord" autoFocus />
        {error && <p className="ins-gate__error" role="alert">{error}</p>}
        <button type="submit" className="big-button big-button--primary" disabled={busy || !password}>{busy ? 'Sjekker …' : 'Vis tallene'}</button>
      </form>
    </main>
  );
}

function ManageAccess() {
  const [open, setOpen] = useState(false);
  const [hasPassword, setHasPassword] = useState(null);
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');
  useEffect(() => { fetch('/api/innsikt/passord').then((r) => (r.ok ? r.json() : null)).then((d) => setHasPassword(d ? d.hasPassword : null)).catch(() => {}); }, []);
  const save = async (e) => {
    e.preventDefault();
    setMsg('');
    const r = await fetch('/api/innsikt/passord', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setMsg(d.error || 'Kunne ikke lagre.'); return; }
    setPassword(''); setHasPassword(true);
    setMsg('Lagret. Del lenken og passordet med Finns.Fairway. Gamle innlogginger er logget ut.');
  };
  const link = typeof window !== 'undefined' ? `${window.location.origin}/innsikt` : 'https://finnsvei.no/innsikt';
  return (
    <section className="ins-manage">
      <button type="button" className="ins-manage__toggle" onClick={() => setOpen((v) => !v)}>
        {hasPassword === false ? 'Sett passord for deling' : 'Deling og passord'} {open ? '▴' : '▾'}
      </button>
      {open && (
        <form onSubmit={save} className="ins-manage__form">
          <p>Lenke: <strong>{link}</strong>. {hasPassword ? 'Et passord er satt. Nytt passord logger ut alle som brukte det gamle.' : 'Ingen passord er satt ennå, så bare innlogget stab ser siden.'}</p>
          <div className="ins-manage__row">
            <input type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Nytt passord (minst 10 tegn)" aria-label="Nytt passord" autoComplete="new-password" />
            <button type="submit" className="big-button big-button--secondary" disabled={password.length < 10}>Lagre</button>
          </div>
          {msg && <p className="ins-manage__msg">{msg}</p>}
        </form>
      )}
    </section>
  );
}

const fmt = (n) => Number(n || 0).toLocaleString('nb-NO');

export default function Innsikt() {
  const [state, setState] = useState({ status: 'loading', data: null });
  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/innsikt/data');
      if (r.status === 401) { setState({ status: 'gate', data: null }); return; }
      if (!r.ok) { setState({ status: 'error', data: null }); return; }
      setState({ status: 'ok', data: await r.json() });
    } catch (_e) { setState({ status: 'error', data: null }); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const d = state.data;
  const hourLabels = useHourLabels(d?.last48 || []);

  return (
    <>
      <Head>
        <title>Finnsvei i tall</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      {state.status === 'gate' && <Gate onDone={load} />}
      {state.status === 'loading' && <main className="ins-loading">Henter tall …</main>}
      {state.status === 'error' && <main className="ins-loading">Kunne ikke hente tallene. Prøv igjen om litt.</main>}
      {state.status === 'ok' && d && (
        <main className="ins">
          <header className="ins-head">
            <Logo size="sm" />
            <div>
              <h1>Finnsvei i tall</h1>
              <p>Meldinger om utrygge veier for barn, fra hele Norge. Oppdatert {new Date(d.generatedAt).toLocaleString('nb-NO', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Oslo' })}.</p>
            </div>
          </header>

          {d.canManage && <ManageAccess />}

          <section className="ins-hero">
            <div className="ins-hero__main">
              <span>Meldinger totalt</span>
              <strong>{fmt(d.totals.reports)}</strong>
              <em>+{fmt(d.totals.last24)} siste døgn</em>
            </div>
            <div><span>Kommuner</span><strong>{fmt(d.totals.kommuner)}</strong><em>i {d.totals.fylker} fylker</em></div>
            <div><span>Innbyggerstøtter</span><strong>{fmt(d.totals.support)}</strong><em>«jeg er enig»</em></div>
            <div><span>Flere bekymringer</span><strong>{Math.round((d.totals.multiConcern / Math.max(1, d.totals.reports)) * 100)} %</strong><em>krysset av mer enn én</em></div>
          </section>

          <section className="ins-card ins-span2">
            <h2>Utviklingen</h2>
            <p className="ins-sub">Antall meldinger totalt over tid.</p>
            <CumulativeChart data={d.cumulative} />
          </section>

          <section className="ins-card ins-span2">
            <h2>Siste 48 timer</h2>
            <p className="ins-sub">Nye meldinger per time.</p>
            <ColumnChart values={d.last48.map((h) => h.count)} labels={hourLabels} ariaLabel="Nye meldinger per time siste 48 timer" tipLabel="meldinger" labelEvery={6} highlightLast />
          </section>

          <section className="ins-card ins-span2 ins-where">
            <div>
              <h2>Hvor</h2>
              <p className="ins-sub">Der det er meldt fra. Mørkere er flere meldinger.</p>
              <HeatMap points={d.points} />
            </div>
            <div>
              <h3>Fylker</h3>
              <RankBars items={d.fylker} total={d.totals.reports} />
              <h3>Kommuner</h3>
              <RankBars items={d.kommuner} />
            </div>
          </section>

          <section className="ins-card">
            <h2>Når på døgnet</h2>
            <p className="ins-sub">Alle meldinger, etter klokkeslett.</p>
            <ColumnChart values={d.byHourOfDay} labels={d.byHourOfDay.map((_, i) => String(i).padStart(2, '0'))} ariaLabel="Meldinger etter time på døgnet" tipLabel="meldinger" labelEvery={3} />
          </section>

          <section className="ins-card">
            <h2>Hva folk er bekymret for</h2>
            <p className="ins-sub">Hver bekymring telt, også når én melding har flere.</p>
            <RankBars items={d.concerns} total={d.totals.reports} />
          </section>

          <section className="ins-card">
            <h2>Hvem melder</h2>
            <p className="ins-sub">Voksne og barn. Barn melder anonymt.</p>
            <SplitBar parts={[
              { name: 'Voksne', count: d.totals.voksen, color: INSIGHT_COLORS.BLUE },
              { name: 'Barn', count: d.totals.barn, color: INSIGHT_COLORS.ORANGE },
            ]} />
          </section>

          <section className="ins-card">
            <h2>Hovedkategori</h2>
            <p className="ins-sub">Det som ble valgt først i meldingen.</p>
            <RankBars items={d.mainCategory} total={d.totals.reports} />
          </section>

          <footer className="ins-foot">Finnsvei er Stiftelsen Finns.Fairways løsning for tryggere veier til skole og trening. Tallene er samlet; ingen navn eller kontaktinfo vises her.</footer>
        </main>
      )}
    </>
  );
}
