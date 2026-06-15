import Head from 'next/head';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';

const EMPTY_CLUB = { name: '', latlng: '' };

function parseLatLng(value) {
  const match = String(value || '').trim().match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
  if (!match) return null;
  return { lat: Number(match[1]), lng: Number(match[2]) };
}

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
  const [clubs, setClubs] = useState([{ ...EMPTY_CLUB }]);

  useEffect(() => {
    if (router.isReady && typeof router.query.secret === 'string') {
      setSecret(router.query.secret);
    }
  }, [router.isReady, router.query.secret]);

  const authHeaders = useCallback(() => ({
    'Content-Type': 'application/json',
    'x-backoffice-secret': secret,
  }), [secret]);

  const load = useCallback(async () => {
    if (!secret) return;
    setLoading(true);
    setStatus('');
    try {
      const response = await fetch('/api/backoffice/competitions', { headers: authHeaders() });
      if (response.status === 403) { setStatus('Feil passord.'); setCompetitions([]); return; }
      if (!response.ok) throw new Error('Kunne ikke hente konkurranser');
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
    setName(''); setDescription(''); setStartsOn(''); setEndsOn(''); setHelmetFocus(true);
    setClubs([{ ...EMPTY_CLUB }]);
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!name.trim()) { setStatus('Gi konkurransen et navn.'); return; }
    const payloadClubs = clubs
      .filter((club) => club.name.trim())
      .map((club) => {
        const coords = parseLatLng(club.latlng);
        return coords ? { name: club.name.trim(), lat: coords.lat, lng: coords.lng } : { name: club.name.trim() };
      });
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
          clubs: payloadClubs,
          active: true,
        }),
      });
      if (!response.ok) throw new Error('Kunne ikke opprette konkurransen');
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
      <main className="page admin-page">
        <h1>Konkurranser</h1>
        <p className="admin-help">Definer sykkelkonkurranser for barn. Klubbens posisjon (valgfritt) brukes som mål på bevegelseskartet – lim inn «lat, lng» fra Google Maps.</p>

        <label className="admin-field">
          <span>Backoffice-passord</span>
          <input type="password" value={secret} onChange={(event) => setSecret(event.target.value)} placeholder="BACKOFFICE_SECRET" />
        </label>
        <button type="button" className="big-button big-button--secondary" onClick={load} disabled={!secret || loading}>
          {loading ? 'Laster …' : 'Hent konkurranser'}
        </button>

        {status && <div className="admin-status">{status}</div>}

        <section className="admin-section">
          <h2>Eksisterende</h2>
          {competitions.length === 0 && <p className="comp-muted">Ingen konkurranser ennå.</p>}
          <ul className="admin-list">
            {competitions.map((competition) => (
              <li key={competition.id} className="admin-list__item">
                <div>
                  <strong>{competition.name}</strong>
                  <span className="admin-list__meta">
                    {competition.active ? 'Aktiv' : 'Skjult'} · {competition.clubs.length} klubber
                    {competition.starts_on ? ` · ${competition.starts_on}` : ''}{competition.ends_on ? `–${competition.ends_on}` : ''}
                  </span>
                </div>
                <button type="button" className="big-button big-button--secondary" onClick={() => toggleActive(competition)}>
                  {competition.active ? 'Skjul' : 'Aktiver'}
                </button>
              </li>
            ))}
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
            <label className="admin-check">
              <input type="checkbox" checked={helmetFocus} onChange={(event) => setHelmetFocus(event.target.checked)} />
              <span>Vis hjelm-fokus</span>
            </label>

            <div className="admin-clubs">
              <span className="admin-field__label">Klubber</span>
              {clubs.map((club, index) => (
                <div key={index} className="admin-club-row">
                  <input value={club.name} onChange={(event) => updateClub(index, 'name', event.target.value)} placeholder="Klubbnavn" />
                  <input value={club.latlng} onChange={(event) => updateClub(index, 'latlng', event.target.value)} placeholder="lat, lng (valgfritt)" />
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
