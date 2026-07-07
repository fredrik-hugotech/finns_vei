import Head from 'next/head';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { reportStatusMeta } from '../../../lib/reportStatusMeta';
import { REPORT_STATUS } from '../../../lib/config';

const STATUSES = [REPORT_STATUS.NEW, REPORT_STATUS.REGISTERED, REPORT_STATUS.STARTED, REPORT_STATUS.DONE];

function fmtDate(value) {
  if (!value) return '';
  try { return new Date(value).toLocaleString('nb-NO', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch (_e) { return value; }
}
function ownerLabel(owner) {
  const map = { kommune: 'Kommunal vei', fylke: 'Fylkesvei', stat: 'Riksvei/Europavei', privat: 'Privat vei' };
  return map[String(owner || '').toLowerCase()] || owner || null;
}

export default function SakDetalj() {
  const router = useRouter();
  const { id } = router.query;
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [noteMode, setNoteMode] = useState('public');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState('');
  const [uploadVis, setUploadVis] = useState('internal');
  const [uploading, setUploading] = useState(false);
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const r = await fetch(`/api/backoffice/cases?id=${encodeURIComponent(id)}`);
      if (r.status === 403) { setError('not-authed'); return; }
      if (!r.ok) { setError('Kunne ikke hente saken.'); return; }
      const d = await r.json();
      setData(d);
      setStatus(d.case?.status || '');
    } catch (_e) { setError('Noe gikk galt.'); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const c = data?.case;
  const meta = useMemo(() => reportStatusMeta(status || c?.status), [status, c]);

  const changeStatus = async (next) => {
    setStatus(next);
    try { await fetch('/api/backoffice/cases', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'set-status', id, status: next }) }); setFlash('Status oppdatert'); setTimeout(() => setFlash(''), 1600); }
    catch (_e) { setFlash('Kunne ikke endre status'); }
  };

  const addNote = async () => {
    const text = note.trim();
    if (text.length < 2) return;
    setBusy(true); setFlash('');
    try {
      const action = noteMode === 'internal' ? 'add-internal' : 'add-update';
      const r = await fetch('/api/backoffice/cases', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, id, text }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setFlash(d.error || 'Kunne ikke lagre.'); return; }
      setNote('');
      setFlash(noteMode === 'internal' ? 'Internt notat lagt til' : 'Oppdatering publisert');
      load();
    } catch (_e) { setFlash('Noe gikk galt.'); } finally { setBusy(false); }
  };

  const doUpload = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    setUploading(true); setFlash('');
    try {
      for (const file of files) {
        const fd = new FormData();
        fd.append('reportId', String(id));
        fd.append('visibility', uploadVis);
        fd.append('file', file);
        const r = await fetch('/api/backoffice/attachment', { method: 'POST', body: fd });
        if (!r.ok) { const d = await r.json().catch(() => ({})); setFlash(d.error || 'Opplasting feilet'); break; }
      }
      setFlash('Vedlegg lagt til');
      load();
    } catch (_e) { setFlash('Opplasting feilet'); } finally { setUploading(false); }
  };
  const toggleAtt = async (att) => {
    await fetch('/api/backoffice/attachment', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: att.id, visibility: att.visibility === 'public' ? 'internal' : 'public' }) }).catch(() => {});
    load();
  };
  const deleteAtt = async (att) => {
    await fetch('/api/backoffice/attachment', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: att.id }) }).catch(() => {});
    load();
  };
  const isImage = (a) => String(a.content_type || '').startsWith('image/');
  const mapThumb = (c && mapboxToken && Number.isFinite(Number(c.lat)))
    ? `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/pin-s+0b5d4d(${c.lng},${c.lat})/${c.lng},${c.lat},15,0/560x300@2x?access_token=${mapboxToken}`
    : null;

  if (error === 'not-authed') {
    return <main className="page admin-page"><p className="admin-list-empty">Logg inn først. <Link href="/backoffice">Til innlogging</Link></p></main>;
  }

  return (
    <>
      <Head><title>{c ? `${c.category} – sak` : 'Sak'}</title><meta name="robots" content="noindex" /></Head>
      <main className="page sak-page">
        <div className="sak-top">
          <Link className="admin-back-link" href="/backoffice/liste">‹ Saker</Link>
          {flash && <span className="sak-flash">{flash}</span>}
        </div>

        {error && <div className="admin-status">{error}</div>}
        {!c && !error && <p className="admin-list-empty">Laster …</p>}

        {c && (
          <>
            <header className="sak-head">
              <span className={`status-pill status-pill--${meta.key}`} dangerouslySetInnerHTML={{ __html: `${meta.icon}<span>${meta.label}</span>` }} />
              <h1>{c.category}</h1>
              <p className="sak-head__meta">Meldt {fmtDate(c.created_at)} · {c.reporter_type === 'voksen' ? 'voksen' : 'barn'}{c.bike_route_type ? ` · ${c.bike_route_type === 'skole' ? 'skolerute' : 'fritidsrute'}` : ''}</p>
            </header>

            <div className="sak-grid">
              <div className="sak-main">
                <section className="admin-section">
                  <h2>Melding</h2>
                  <p className="sak-desc">{c.description || 'Ingen beskrivelse.'}</p>
                  {c.images?.length > 0 && (
                    <div className="sak-images">
                      {c.images.map((src, i) => <a key={i} href={src} target="_blank" rel="noopener noreferrer"><img src={src} alt="" /></a>)}
                    </div>
                  )}
                </section>

                <section className="admin-section">
                  <div className="sak-att__head">
                    <h2>Vedlegg</h2>
                    <div className="case-admin__notetabs sak-att__vis">
                      <button type="button" className={uploadVis === 'internal' ? 'case-admin__tab case-admin__tab--on' : 'case-admin__tab'} onClick={() => setUploadVis('internal')}>Internt</button>
                      <button type="button" className={uploadVis === 'public' ? 'case-admin__tab case-admin__tab--on' : 'case-admin__tab'} onClick={() => setUploadVis('public')}>Offentlig</button>
                    </div>
                  </div>
                  <label className="sak-upload">
                    <input type="file" accept="image/*,application/pdf" multiple onChange={(e) => doUpload(e.target.files)} disabled={uploading} hidden />
                    <span>{uploading ? 'Laster opp …' : `+ Legg til ${uploadVis === 'public' ? 'offentlig' : 'internt'} vedlegg`}</span>
                  </label>
                  {(data.attachments || []).length > 0 && (
                    <div className="sak-att__grid">
                      {data.attachments.map((a) => (
                        <div key={a.id} className={a.visibility === 'public' ? 'sak-att sak-att--public' : 'sak-att'}>
                          <a href={a.url} target="_blank" rel="noopener noreferrer" className="sak-att__thumb">
                            {isImage(a) ? <img src={a.url} alt={a.filename || ''} /> : <span className="sak-att__file">PDF</span>}
                          </a>
                          <div className="sak-att__meta">
                            <span className={a.visibility === 'public' ? 'sak-att__badge sak-att__badge--public' : 'sak-att__badge'}>{a.visibility === 'public' ? 'Offentlig' : 'Internt'}</span>
                            <div className="sak-att__row">
                              <button type="button" onClick={() => toggleAtt(a)}>{a.visibility === 'public' ? 'Gjør intern' : 'Gjør offentlig'}</button>
                              <button type="button" onClick={() => deleteAtt(a)}>Slett</button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <section className="admin-section">
                  <h2>Tidslinje</h2>
                  <ul className="sak-timeline">
                    {(data.timeline || []).map((t, i) => (
                      <li key={i} className={t.source === 'internal' ? 'sak-tl sak-tl--internal' : 'sak-tl'}>
                        <div className="sak-tl__row">
                          <span className="sak-tl__tag">{t.source === 'internal' ? 'Internt notat' : 'Offentlig oppdatering'}</span>
                          <span className="sak-tl__time">{fmtDate(t.created_at)}</span>
                        </div>
                        <p className="sak-tl__text">{t.note}</p>
                      </li>
                    ))}
                    <li className="sak-tl sak-tl--start">
                      <div className="sak-tl__row"><span className="sak-tl__tag">Sak opprettet</span><span className="sak-tl__time">{fmtDate(c.created_at)}</span></div>
                    </li>
                  </ul>
                </section>
              </div>

              <aside className="sak-side">
                <section className="admin-section">
                  <h2>Behandling</h2>
                  <label className="admin-field"><span>Status</span>
                    <select className="comp-select" value={status} onChange={(e) => changeStatus(e.target.value)}>
                      {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </label>

                  <div className="case-admin__notetabs">
                    <button type="button" className={noteMode === 'public' ? 'case-admin__tab case-admin__tab--on' : 'case-admin__tab'} onClick={() => setNoteMode('public')}>Offentlig</button>
                    <button type="button" className={noteMode === 'internal' ? 'case-admin__tab case-admin__tab--on' : 'case-admin__tab'} onClick={() => setNoteMode('internal')}>Internt notat</button>
                  </div>
                  <textarea className="sak-note" rows={noteMode === 'internal' ? 5 : 3} value={note} onChange={(e) => setNote(e.target.value)}
                    placeholder={noteMode === 'internal' ? 'Lim inn e-post fra kommunen, eller skriv et internt notat. Kun for ansatte.' : 'Oppdatering som vises for innbygger.'} />
                  <button type="button" className="big-button big-button--primary" onClick={addNote} disabled={busy || note.trim().length < 2}>
                    {busy ? 'Lagrer …' : (noteMode === 'internal' ? 'Legg til notat' : 'Publiser oppdatering')}
                  </button>
                </section>

                <section className="admin-section">
                  <h2>Sted</h2>
                  {mapThumb && (
                    <Link href={`/?sak=${encodeURIComponent(c.id)}`} className="sak-mapthumb">
                      <img src={mapThumb} alt="Kart over stedet" />
                    </Link>
                  )}
                  {ownerLabel(c.road_owner) && <p className="sak-kv"><span>Veieier</span><b>{ownerLabel(c.road_owner)}</b></p>}
                  {c.speed_limit && <p className="sak-kv"><span>Fartsgrense</span><b>{c.speed_limit} km/t</b></p>}
                  {c.road_reference && <p className="sak-kv"><span>Vegreferanse</span><b>{c.road_reference}</b></p>}
                  <div className="sak-side__actions">
                    <Link className="big-button big-button--secondary" href={`/?sak=${encodeURIComponent(c.id)}`}>Vis på kart</Link>
                    {Number.isFinite(Number(c.lat)) && <a className="big-button big-button--secondary" href={`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${c.lat},${c.lng}`} target="_blank" rel="noopener noreferrer">Street View</a>}
                  </div>
                </section>

                {(c.contact_name || c.contact_email || c.contact_phone) && (
                  <section className="admin-section">
                    <h2>Kontakt</h2>
                    {c.contact_name && <p className="sak-kv"><span>Navn</span><b>{c.contact_name}</b></p>}
                    {c.contact_email && <p className="sak-kv"><span>E-post</span><b><a href={`mailto:${c.contact_email}`}>{c.contact_email}</a></b></p>}
                    {c.contact_phone && <p className="sak-kv"><span>Telefon</span><b><a href={`tel:${c.contact_phone}`}>{c.contact_phone}</a></b></p>}
                  </section>
                )}

                {data.trelloCardUrl && (
                  <section className="admin-section">
                    <a className="big-button big-button--secondary" href={data.trelloCardUrl} target="_blank" rel="noopener noreferrer">Åpne i Trello ↗</a>
                  </section>
                )}
              </aside>
            </div>
          </>
        )}
      </main>
    </>
  );
}
