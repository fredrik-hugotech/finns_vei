import Head from 'next/head';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import BackofficeHeader from '../../components/BackofficeHeader';

const EMPTY_CLUB = { name: '' };

export default function KonkurranserAdmin() {
  const router = useRouter();
  const [secret, setSecret] = useState('');
  const [competitions, setCompetitions] = useState([]);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [startsOn, setStartsOn] = useState('');
  const [endsOn, setEndsOn] = useState('');
  const [helmetFocus, setHelmetFocus] = useState(true);
  const [metric, setMetric] = useState('trips');
  const [clubs, setClubs] = useState([{ ...EMPTY_CLUB }]);

  useEffect(() => {
    if (router.isReady && typeof router.query.secret === 'string') {
      setSecret(router.query.secret);
      return;
    }
    try {
      const stored = window.localStorage.getItem('ff-admin-secret');
      if (stored) setSecret(stored);
    } catch (_e) { /* ignore */ }
  }, [router.isReady, router.query.secret]);

  // Cookie session authorises admin requests; no manual password needed.
  const authHeaders = useCallback(() => ({ 'Content-Type': 'application/json' }), []);

  const load = useCallback(async () => {
    setLoading(true);
    setStatus('');
    try {
      const response = await fetch('/api/backoffice/competitions', { headers: authHeaders() });
      if (response.status === 403) {
        setStatus('Logg inn på /backoffice først.');
        setCompetitions([]);
        return;
      }
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || `Kunne ikke hente konkurranser (HTTP ${response.status})`);
      }
      const data = await response.json();
      setCompetitions(data.competitions || []);
    } catch (error) {
      setStatus(error.message || 'Noe gikk galt.');
    } finally {
      setLoading(false);
    }
  }, [secret, authHeaders]);

  useEffect(() => { load(); }, [load]);

  const updateClub = (index, key, value) => {
    setClubs((current) => current.map((club, i) => (i === index ? { ...club, [key]: value } : club)));
  };
  const addClub = () => setClubs((current) => [...current, { ...EMPTY_CLUB }]);
  const removeClub = (index) => setClubs((current) => current.filter((_, i) => i !== index));

  const resetForm = () => {
    setName(''); setDescription(''); setStartsOn(''); setEndsOn(''); setHelmetFocus(true); setMetric('trips');
    setClubs([{ ...EMPTY_CLUB }]);
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!name.trim()) { setStatus('Gi konkurransen et navn.'); return; }
    const payloadClubs = clubs
      .filter((club) => club.name.trim())
      .map((club) => ({ name: club.name.trim() }));
    try {
      const response = await fetch('/api/backoffice/competitions', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          starts_on: startsOn || null,
          ends_on: endsOn || null,
          helmet_focus: helmetFocus,
          metric,
          clubs: payloadClubs,
          active: true,
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || `Kunne ikke opprette konkurransen (HTTP ${response.status})`);
      }
      setStatus('Konkurranse opprettet ✓');
      resetForm();
      load();
    } catch (error) {
      setStatus(error.message || 'Noe gikk galt.');
    }
  };

  const toggleActive = async (competition) => {
    try {
      await fetch('/api/backoffice/competitions', {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ id: competition.id, active: !competition.active }),
      });
      load();
    } catch (_error) {
      setStatus('Kunne ikke endre status.');
    }
  };

  return (
    <>
      <Head><title>Konkurranser – backoffice</title><meta name="robots" content="noindex" /></Head>
      <BackofficeHeader title="Konkurranser" />
      <main className="page admin-page">
        <h1>Konkurranser</h1>

        {status && <div className="admin-status">{status}</div>}

        <section className="admin-section">
          <div className="dash2__h2row"><h2 style={{ margin: 0 }}>Eksisterende</h2>{loading && <span className="comp-muted">Laster …</span>}</div>
          {!loading && competitions.length === 0 && <p className="comp-muted">Ingen konkurranser ennå.</p>}
          <ul className="comp-cards">
            {competitions.map((competition) => {
              const period = [competition.starts_on, competition.ends_on].filter(Boolean).join(' – ');
              return (
                <li key={competition.id} className="comp-card">
                  <div className="comp-card__body">
                    <div className="comp-card__top">
                      <strong className="comp-card__name">{competition.name}</strong>
                      <span className={competition.active ? 'comp-badge comp-badge--on' : 'comp-badge'}>{competition.active ? 'Aktiv' : 'Skjult'}</span>
                    </div>
                    <span className="comp-card__meta">
                      {competition.clubs.length} klubb{competition.clubs.length === 1 ? '' : 'er'}
                      {period ? ` · ${period}` : ''}
                      {competition.metric === 'distance' ? ' · flest km' : ' · flest turer'}
                    </span>
                  </div>
                  <button type="button" className="comp-toggle" onClick={() => toggleActive(competition)}>
                    {competition.active ? 'Skjul' : 'Aktiver'}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="admin-section">
          <h2>Ny konkurranse</h2>
          <form className="admin-form" onSubmit={submit}>
            <label className="admin-field">
              <span>Navn</span>
              <input value={name} onChange={(event) => setName(event.target.value)} placeholder="F.eks. Sykle til trening i august" />
            </label>
            <label className="admin-field">
              <span>Beskrivelse</span>
              <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Klubben med flest sykkelturer vinner …" />
            </label>
            <div className="admin-row">
              <label className="admin-field">
                <span>Fra dato</span>
                <input type="date" value={startsOn} onChange={(event) => setStartsOn(event.target.value)} />
              </label>
              <label className="admin-field">
                <span>Til dato</span>
                <input type="date" value={endsOn} onChange={(event) => setEndsOn(event.target.value)} />
              </label>
            </div>
            <label className="admin-field">
              <span>Vinnerkriterium</span>
              <select className="comp-select" value={metric} onChange={(event) => setMetric(event.target.value)}>
                <option value="trips">Flest turer</option>
                <option value="distance">Flest kilometer</option>
              </select>
            </label>

            <label className="admin-check">
              <input type="checkbox" checked={helmetFocus} onChange={(event) => setHelmetFocus(event.target.checked)} />
              <span>Vis hjelm-fokus</span>
            </label>

            <div className="admin-clubs">
              <span className="admin-field__label">Klubber</span>
              {clubs.map((club, index) => (
                <div key={index} className="admin-club-row admin-club-row--name">
                  <input value={club.name} onChange={(event) => updateClub(index, 'name', event.target.value)} placeholder="Klubbnavn" />
                  {clubs.length > 1 && (
                    <button type="button" className="admin-club-remove" onClick={() => removeClub(index)} aria-label="Fjern">×</button>
                  )}
                </div>
              ))}
              <button type="button" className="big-button big-button--secondary" onClick={addClub}>+ Legg til klubb</button>
            </div>

            <button type="submit" className="big-button big-button--primary">Opprett konkurranse</button>
          </form>
        </section>
      </main>
    </>
  );
}
