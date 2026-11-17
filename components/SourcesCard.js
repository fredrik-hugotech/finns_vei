import { useEffect, useMemo, useState } from 'react';

// Innsikt › Oversikt: where reports come from, plus a link builder so posts
// on Facebook, in newsletters or on posters can be told apart.
const CHANNELS = [['facebook', 'Facebook'], ['instagram', 'Instagram'], ['nyhetsbrev', 'Nyhetsbrev/e-post'], ['qr', 'QR/plakat'], ['presse', 'Presse'], ['annet', 'Annet']];

function LinkBuilder() {
  const [source, setSource] = useState('facebook');
  const [campaign, setCampaign] = useState('');
  const [msg, setMsg] = useState('');
  const link = useMemo(() => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://finnsvei.no';
    const c = campaign.trim().toLowerCase().replace(/[^a-z0-9æøå]+/g, '-').replace(/^-|-$/g, '');
    return `${origin}/?utm_source=${source}${c ? `&utm_campaign=${encodeURIComponent(c)}` : ''}`;
  }, [source, campaign]);
  const copy = async () => { try { await navigator.clipboard.writeText(link); setMsg('Kopiert'); setTimeout(() => setMsg(''), 1500); } catch (_e) { window.prompt('Kopier lenken:', link); } };
  return (
    <div className="src-builder">
      <strong>Lag en sporbar delelenke</strong>
      <span>Bruk egen lenke for hvert innlegg, så ser dere hvilket som gir flest meldinger.</span>
      <div className="src-builder__row">
        <select className="comp-select" value={source} onChange={(e) => setSource(e.target.value)} aria-label="Kanal">
          {CHANNELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <input className="comp-select" value={campaign} onChange={(e) => setCampaign(e.target.value)} placeholder="Navn, f.eks. fau-lunde-skole" aria-label="Navn på innlegget" maxLength={60} />
      </div>
      <div className="src-builder__out">
        <code>{link}</code>
        <button type="button" className="finn-btn" onClick={copy}>{msg || 'Kopier'}</button>
      </div>
    </div>
  );
}

export default function SourcesCard() {
  const [d, setD] = useState(null);
  const [range, setRange] = useState('30');
  useEffect(() => { fetch('/api/backoffice/kilder').then((r) => (r.ok ? r.json() : null)).then(setD).catch(() => {}); }, []);
  const rows = (range === '30' ? d?.channels30 : d?.channels) || [];
  const max = Math.max(1, ...rows.map((r) => r.antall));
  return (
    <section className="src">
      <div className="dash2__h2row">
        <h2 className="dash2__h2">Hvor kommer meldingene fra</h2>
        <div className="src-range">
          <button type="button" aria-pressed={range === '30'} className={range === '30' ? 'on' : ''} onClick={() => setRange('30')}>30 dager</button>
          <button type="button" aria-pressed={range === 'alle'} className={range === 'alle' ? 'on' : ''} onClick={() => setRange('alle')}>Alt</button>
        </div>
      </div>
      <div className="src-grid">
        <div className="src-card">
          {!d && <p className="admin-list-empty">Henter …</p>}
          {d && d.measured === 0 && <p className="admin-list-empty">Måles fra nå av. Nye meldinger får kilde, så tallene fylles på etter hvert.</p>}
          {rows.length > 0 && (
            <ul className="finn-bars src-bars">
              {rows.slice(0, 10).map((r) => <li key={r.navn}><span title={r.navn}>{r.navn}</span><i style={{ width: `${(r.antall / max) * 100}%` }} /><b>{r.antall}</b></li>)}
            </ul>
          )}
          {d && d.measured > 0 && <p className="src-note">{d.measured} meldinger med kilde (målt fra {new Date(d.measuredSince).toLocaleDateString('nb-NO', { day: 'numeric', month: 'long' })}). Facebook viser ikke hvilket innlegg; bruk sporbare lenker for det.</p>}
          {d?.campaigns?.length > 0 && (
            <>
              <h3 className="src-h3">Delelenker</h3>
              <ul className="finn-bars src-bars">
                {d.campaigns.map((r) => <li key={r.navn}><span title={r.navn}>{r.navn}</span><i style={{ width: `${(r.antall / Math.max(1, d.campaigns[0].antall)) * 100}%` }} /><b>{r.antall}</b></li>)}
              </ul>
            </>
          )}
        </div>
        <LinkBuilder />
      </div>
    </section>
  );
}
