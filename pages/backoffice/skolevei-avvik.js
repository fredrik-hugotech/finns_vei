import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import BackofficeHeader from '../../components/BackofficeHeader';
import { timeAgo, describeFetchError } from '../../lib/backofficeFormat';

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

function fmtDate(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' });
}

function period(item) {
  const from = fmtDate(item.start);
  const to = fmtDate(item.end);
  if (item.upcoming && from) return `Fra ${from}${to ? ` til ${to}` : ''}`;
  if (to) return `Til ${to}`;
  return 'Inntil videre';
}

function fmtDistance(m) {
  return m < 1000 ? `${m} m` : `${(m / 1000).toLocaleString('nb-NO', { maximumFractionDigits: 1 })} km`;
}

// Static map: affected stops (red) and the nearest school (green).
function mapThumb(item) {
  if (!MAPBOX_TOKEN) return null;
  const pins = item.stops.slice(0, 8).map((s) => `pin-s+dc2626(${s.lng.toFixed(5)},${s.lat.toFixed(5)})`);
  const school = item.closestSchool;
  pins.push(`pin-s-school+0b5d4d(${school.lng.toFixed(5)},${school.lat.toFixed(5)})`);
  return `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/${pins.join(',')}/auto/520x260@2x?padding=50&access_token=${MAPBOX_TOKEN}`;
}

function Item({ item }) {
  const thumb = mapThumb(item);
  const school = item.closestSchool;
  return (
    <article className={item.nearSchool ? 'avvik avvik--near' : 'avvik'}>
      <div className="avvik__head">
        <span className={item.nearSchool ? 'avvik__badge avvik__badge--near' : 'avvik__badge'}>
          {fmtDistance(school.distanceM)} fra {school.name}{school.students ? ` · ${school.students} elever` : ''}
        </span>
        <span className={item.upcoming ? 'avvik__when avvik__when--soon' : 'avvik__when'}>{item.nightOnly ? 'Nattbuss · ' : ''}{period(item)}</span>
      </div>
      <strong className="avvik__title">{item.summary || 'Avvik'}</strong>
      {item.description && item.description !== item.summary && <p className="avvik__text">{item.description}</p>}
      {item.advice && <p className="avvik__text avvik__text--advice">{item.advice}</p>}
      <ul className="avvik__stops">
        {item.stops.map((s) => (
          <li key={s.id}>
            <span>{s.name}{s.lines.length ? ` · linje ${s.lines.join(', ')}` : ''}</span>
            <span className="avvik__dist">{fmtDistance(s.school.distanceM)} fra {s.school.name}</span>
          </li>
        ))}
      </ul>
      {thumb && <img className="avvik__map" src={thumb} alt={`Kart over ${item.stops.length === 1 ? 'holdeplassen' : 'holdeplassene'} og ${school.name}`} loading="lazy" />}
    </article>
  );
}

// Disruptions to buses (closed stops, detours) near schools — from Entur's
// open data, matched to the municipality's schools. See
// pages/api/backoffice/skolevei-avvik.js.
export default function SkoleveiAvvik() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [showOther, setShowOther] = useState(false);

  useEffect(() => {
    fetch('/api/backoffice/skolevei-avvik')
      .then(async (r) => {
        if (r.status === 403) throw new Error('not-authed');
        if (!r.ok) throw new Error(await describeFetchError(r, 'Kunne ikke hente avvik.'));
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message === 'not-authed' ? 'not-authed' : e.message));
  }, []);

  const near = (data?.items || []).filter((i) => i.nearSchool);
  const other = (data?.items || []).filter((i) => !i.nearSchool);

  return (
    <>
      <Head><title>Avvik ved skolevei – Finns Fairway</title><meta name="robots" content="noindex" /><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" /></Head>
      <BackofficeHeader title="Avvik ved skolevei" />
      <main className="page admin-list-page">
        <p className="dash2__hint" style={{ margin: 0 }}>
          Stengte holdeplasser og omkjøringer for bussen nær skolene. Barn kan da måtte gå en annen vei enn de er vant til.
        </p>

        {error === 'not-authed' && <p className="admin-list-empty">Logg inn først. <Link href="/backoffice">Til innlogging</Link></p>}
        {error && error !== 'not-authed' && <p className="admin-list-empty">{error}</p>}
        {!error && data === null && <p className="admin-list-empty">Henter avvik fra Entur …</p>}

        {data && (
          <>
            <p className="sak-count">
              {near.length === 0 ? 'Ingen avvik nær skoler nå' : `${near.length} avvik innen ${data.nearSchoolM} m fra en skole`}
              <span className="dash2__hint"> · hentet {timeAgo(data.cachedAt)}{data.stale ? ' (Entur svarer ikke, viser forrige svar)' : ''}</span>
            </p>
            <div className="avvik-list">
              {near.map((item) => <Item key={item.id} item={item} />)}
            </div>

            {other.length > 0 && (
              <>
                <button type="button" className="avvik-more" aria-expanded={showOther} onClick={() => setShowOther((v) => !v)}>
                  {showOther ? 'Skjul' : 'Vis'} {other.length} andre avvik i området
                </button>
                {showOther && <div className="avvik-list">{other.map((item) => <Item key={item.id} item={item} />)}</div>}
              </>
            )}

            <p className="dash2__hint avvik-source">
              Kilder: Entur (avvik fra Agder Kollektivtrafikk) og Utdanningsdirektoratets skoleregister ({data.schools} skoler, hentet {fmtDate(data.schoolsFetched)}).
            </p>
          </>
        )}
      </main>
    </>
  );
}
