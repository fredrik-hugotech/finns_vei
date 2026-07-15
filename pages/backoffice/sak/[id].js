import Head from 'next/head';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { reportStatusMeta } from '../../../lib/reportStatusMeta';
import { REPORT_STATUS } from '../../../lib/config';
import BackofficeHeader from '../../../components/BackofficeHeader';

const STATUSES = [REPORT_STATUS.NEW, REPORT_STATUS.REGISTERED, REPORT_STATUS.STARTED, REPORT_STATUS.DONE];
const ACT_LABEL = { created: 'Sak opprettet', voice: 'Innbyggerstemme', public: 'Offentlig oppdatering', internal: 'Internt notat' };

function fmtDate(value) {
  if (!value) return '';
  try { return new Date(value).toLocaleString('nb-NO', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch (_e) { return value; }
}
function ownerLabel(owner) {
  const map = { kommune: 'Kommunal vei', fylke: 'Fylkesvei', stat: 'Riksvei/Europavei', privat: 'Privat vei' };
  return map[String(owner || '').toLowerCase()] || owner || null;
}
function distMeters(lng1, lat1, lng2, lat2) {
  const R = 6371000, tr = (d) => (d * Math.PI) / 180;
  const dLa = tr(lat2 - lat1), dLo = tr(lng2 - lng1);
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(tr(lat1)) * Math.cos(tr(lat2)) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
// Turn coordinates into a human place ("Østerveien · Lund") so the case says
// where it was reported, not just its category.
async function reverseGeocode(lat, lng, token) {
  try {
    const r = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${token}&language=no&limit=1&types=address,street,neighborhood,locality,place`);
    if (!r.ok) return null;
    const d = await r.json();
    const f = (d.features || [])[0];
    if (!f) return null;
    const street = String(f.place_name || f.text || '').split(',')[0].trim();
    const ctx = (f.context || []).find((x) => /^(neighborhood|locality|place)/.test(x.id || ''));
    const area = ctx?.text;
    const parts = [street, area].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);
    return parts.join(' · ') || null;
  } catch (_e) { return null; }
}

async function fetchAccidents(lat, lng, radiusM = 50) {
  const dLat = (radiusM * 3) / 111320;
  const dLng = (radiusM * 3) / (111320 * Math.cos((lat * Math.PI) / 180));
  const bbox = [lng - dLng, lat - dLat, lng + dLng, lat + dLat].map((v) => v.toFixed(6)).join(',');
  const r = await fetch(`/api/nvdb/layer?type=accidents&bbox=${encodeURIComponent(bbox)}&zoom=17`);
  if (!r.ok) throw new Error('feil');
  const g = await r.json();
  if (g?.meta?.degraded) throw new Error('degraded');
  return (g.features || [])
    .filter((f) => f.geometry?.type === 'Point' && Array.isArray(f.geometry.coordinates))
    .map((f) => ({ dist: distMeters(lng, lat, f.geometry.coordinates[0], f.geometry.coordinates[1]), year: f.properties?.year || (f.properties?.date ? String(f.properties.date).slice(0, 4) : ''), type: f.properties?.accident_type || '', severity: f.properties?.severity || '' }))
    .filter((a) => a.dist <= radiusM)
    .sort((a, b) => (Number(b.year) || 0) - (Number(a.year) || 0));
}

export default function SakDetalj() {
  const router = useRouter();
  const { id } = router.query;
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [assignee, setAssignee] = useState('');
  const [staffList, setStaffList] = useState([]);
  const [noteMode, setNoteMode] = useState('public');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState('');
  const [uploadVis, setUploadVis] = useState('internal');
  const [uploading, setUploading] = useState(false);
  const [accidents, setAccidents] = useState(null);
  const [showAcc, setShowAcc] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [siblings, setSiblings] = useState(null);
  const [place, setPlace] = useState(null);
  const [descOpen, setDescOpen] = useState(false);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);
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
      setDueDate(d.case?.due_date ? String(d.case.due_date).slice(0, 10) : '');
      setAssignee(d.case?.assignee_email || '');
    } catch (_e) { setError('Noe gikk galt.'); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    fetch('/api/backoffice/cases').then((r) => (r.ok ? r.json() : null)).then((d) => { if (d) setSiblings((d.cases || []).map((x) => String(x.id))); }).catch(() => {});
    fetch('/api/staff/list').then((r) => (r.ok ? r.json() : null)).then((d) => { if (d) setStaffList(d.staff || []); }).catch(() => {});
  }, []);

  const changeDue = async (v) => {
    setDueDate(v);
    try { await fetch('/api/backoffice/cases', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'set-due', id, due_date: v || null }) }); setFlash('Frist oppdatert'); setTimeout(() => setFlash(''), 1500); }
    catch (_e) { setFlash('Kunne ikke lagre frist'); }
  };
  const changeAssignee = async (v) => {
    setAssignee(v);
    try { await fetch('/api/backoffice/cases', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'set-assignee', id, assignee_email: v || null }) }); setFlash('Tildeling oppdatert'); setTimeout(() => setFlash(''), 1500); }
    catch (_e) { setFlash('Kunne ikke lagre tildeling'); }
  };

  const c = data?.case;
  const support = data?.support || { count: 0, voices: [], facets: [] };
  const todayStr = new Date().toISOString().slice(0, 10);
  const meta = useMemo(() => reportStatusMeta(status || c?.status), [status, c]);

  // One chronological activity feed — the way ticket tools show a case:
  // creation, citizen voices, public updates and internal notes together.
  const activity = useMemo(() => {
    if (!c) return [];
    const items = [{ type: 'created', at: c.created_at }];
    for (const v of (support.voices || [])) items.push({ type: 'voice', at: v.created_at, text: v.note, tag: v.category });
    for (const t of (data?.timeline || [])) items.push({ type: t.source === 'internal' ? 'internal' : 'public', at: t.created_at, text: t.note });
    return items.sort((a, b) => new Date(a.at || 0) - new Date(b.at || 0));
  }, [c, support.voices, data?.timeline]);
  const idx = siblings ? siblings.indexOf(String(id)) : -1;
  const prevId = idx > 0 ? siblings[idx - 1] : null;
  const nextId = idx >= 0 && siblings && idx < siblings.length - 1 ? siblings[idx + 1] : null;

  // Arrow keys move between cases (unless typing in a field).
  useEffect(() => {
    const onKey = (e) => {
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (lightbox) return;
      if (e.key === 'ArrowLeft' && prevId) router.push(`/backoffice/sak/${prevId}`);
      if (e.key === 'ArrowRight' && nextId) router.push(`/backoffice/sak/${nextId}`);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [prevId, nextId, router, lightbox]);

  useEffect(() => {
    if (!c || !Number.isFinite(Number(c.lat)) || !Number.isFinite(Number(c.lng))) return undefined;
    let cancelled = false;
    setAccidents(null);
    fetchAccidents(Number(c.lat), Number(c.lng), 50)
      .then((a) => { if (!cancelled) setAccidents(a); })
      .catch(() => { if (!cancelled) setAccidents('error'); });
    return () => { cancelled = true; };
  }, [c]);

  useEffect(() => {
    if (!c || !mapboxToken || !Number.isFinite(Number(c.lat)) || !Number.isFinite(Number(c.lng))) return undefined;
    let cancelled = false;
    reverseGeocode(Number(c.lat), Number(c.lng), mapboxToken).then((p) => { if (!cancelled) setPlace(p); });
    return () => { cancelled = true; };
  }, [c, mapboxToken]);

  const changeStatus = async (next) => {
    setStatus(next);
    try { await fetch('/api/backoffice/cases', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'set-status', id, status: next }) }); setFlash('Status oppdatert'); setTimeout(() => setFlash(''), 1600); }
    catch (_e) { setFlash('Kunne ikke endre status'); }
  };

  const deleteCase = async () => {
    if (deleteConfirm.trim().toUpperCase() !== 'SLETT') return;
    setDeleting(true); setFlash('');
    try {
      const r = await fetch('/api/backoffice/cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', id, confirm: true }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setFlash(d.error || 'Kunne ikke slette saken.'); setDeleting(false); return; }
      router.replace('/backoffice/liste');
    } catch (_e) {
      setFlash('Kunne ikke slette saken.');
      setDeleting(false);
    }
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
    let failed = false;
    try {
      for (const file of files) {
        const fd = new FormData();
        fd.append('reportId', String(id));
        fd.append('visibility', uploadVis);
        fd.append('file', file);
        const r = await fetch('/api/backoffice/attachment', { method: 'POST', body: fd });
        if (!r.ok) { const d = await r.json().catch(() => ({})); setFlash(d.error || 'Opplasting feilet'); failed = true; break; }
      }
      if (!failed) setFlash('Vedlegg lagt til');
      load();
    } catch (_e) { setFlash('Opplasting feilet'); } finally { setUploading(false); }
  };
  const toggleAtt = async (att) => {
    const nextVis = att.visibility === 'public' ? 'internal' : 'public';
    setData((d) => (d ? { ...d, attachments: (d.attachments || []).map((a) => (a.id === att.id ? { ...a, visibility: nextVis } : a)) } : d));
    try { await fetch('/api/backoffice/attachment', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: att.id, visibility: nextVis }) }); }
    catch (_e) { load(); }
  };
  const deleteAtt = async (att) => {
    setData((d) => (d ? { ...d, attachments: (d.attachments || []).filter((a) => a.id !== att.id) } : d));
    try { await fetch('/api/backoffice/attachment', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: att.id }) }); }
    catch (_e) { load(); }
  };
  const isImage = (a) => String(a.content_type || '').startsWith('image/');

  // Paste an image from the clipboard (e.g. a screenshot of an email) → attach it.
  useEffect(() => {
    const onPaste = (e) => {
      const items = e.clipboardData?.items ? Array.from(e.clipboardData.items) : [];
      const files = items.filter((it) => it.kind === 'file' && String(it.type).startsWith('image/')).map((it) => it.getAsFile()).filter(Boolean);
      if (files.length) doUpload(files);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, uploadVis]);
  const mapThumb = (c && mapboxToken && Number.isFinite(Number(c.lat)))
    ? `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/pin-s+0b5d4d(${c.lng},${c.lat})/${c.lng},${c.lat},15,0/560x300@2x?access_token=${mapboxToken}`
    : null;

  if (error === 'not-authed') {
    return <main className="page admin-page"><p className="admin-list-empty">Logg inn først. <Link href="/backoffice">Til innlogging</Link></p></main>;
  }

  return (
    <>
      <Head><title>{c ? `${c.category} – sak` : 'Sak'}</title><meta name="robots" content="noindex" /><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" /></Head>
      <BackofficeHeader title={c ? c.category : 'Sak'} back="/backoffice/liste" />
      <main className="page sak-page">
        {flash && <div className="sak-flashbar">{flash}</div>}
        {idx >= 0 && (
          <nav className="sak-nav">
            {prevId ? <Link className="sak-nav__link" href={`/backoffice/sak/${prevId}`}>‹ Forrige</Link> : <span />}
            <span className="sak-nav__pos">{idx + 1} / {siblings.length}</span>
            {nextId ? <Link className="sak-nav__link" href={`/backoffice/sak/${nextId}`}>Neste ›</Link> : <span />}
          </nav>
        )}

        {error && <div className="admin-status">{error}</div>}
        {!c && !error && <p className="admin-list-empty">Laster …</p>}

        {c && (
          <>
            <header className="sak-hero">
              <div className="sak-hero__topline">
                <span className={`status-pill status-pill--${meta.key}`} dangerouslySetInnerHTML={{ __html: `${meta.icon}<span>${meta.label}</span>` }} />
                <span className="sak-hero__when">Meldt {fmtDate(c.created_at)}</span>
              </div>
              <h1>{c.category}</h1>
              <p className="sak-hero__place">
                <svg className="sak-hero__pin" width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                  <circle cx="12" cy="10" r="2.4" stroke="currentColor" strokeWidth="1.8" />
                </svg>
                <span>{place || (Number.isFinite(Number(c.lat)) ? 'Henter sted …' : 'Sted ukjent')}</span>
              </p>
              <p className="sak-hero__meta">{c.reporter_type === 'voksen' ? 'Meldt av voksen' : 'Meldt av barn'}{c.bike_route_type ? ` · ${c.bike_route_type === 'skole' ? 'skolerute' : 'fritidsrute'}` : ''}</p>
              {c.description && (
                <div className="sak-hero__report">
                  <p className={descOpen ? 'sak-hero__desc' : 'sak-hero__desc sak-hero__desc--clamp'}>{c.description}</p>
                  {c.description.length > 150 && (
                    <button type="button" className="sak-hero__more" onClick={() => setDescOpen((v) => !v)}>{descOpen ? 'Vis mindre' : 'Vis mer'}</button>
                  )}
                </div>
              )}
              {c.images?.length > 0 && (
                <div className="sak-images sak-hero__images">
                  {c.images.map((src, i) => <button type="button" key={i} onClick={() => setLightbox(src)}><img src={src} alt="" /></button>)}
                </div>
              )}
            </header>

            <section className="admin-section tkt-detail">
              <h2>Detaljer</h2>
              <div className="tkt-props">
                <label className="tkt-prop">
                  <span className="tkt-prop__k">Status</span>
                  <select className="tkt-prop__ctrl" value={status} onChange={(e) => changeStatus(e.target.value)}>
                    {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
                <label className="tkt-prop">
                  <span className="tkt-prop__k">Ansvarlig</span>
                  <select className="tkt-prop__ctrl" value={assignee || ''} onChange={(e) => changeAssignee(e.target.value)}>
                    <option value="">Ingen</option>
                    {staffList.map((s) => <option key={s.email} value={s.email}>{s.name || s.email}</option>)}
                  </select>
                </label>
                <label className="tkt-prop">
                  <span className="tkt-prop__k">Frist</span>
                  <input type="date" className={dueDate && String(dueDate) < todayStr && status !== REPORT_STATUS.DONE ? 'tkt-prop__ctrl tkt-prop__ctrl--over' : 'tkt-prop__ctrl'} value={dueDate} onChange={(e) => changeDue(e.target.value)} />
                </label>
                <div className="tkt-prop">
                  <span className="tkt-prop__k">Støtte</span>
                  <span className="tkt-prop__v tkt-prop__v--support">♥ {support.count} innbygger{support.count === 1 ? '' : 'e'}</span>
                </div>
                <div className="tkt-prop">
                  <span className="tkt-prop__k">Melder</span>
                  <span className="tkt-prop__v">{c.reporter_type === 'voksen' ? 'Voksen' : 'Barn'}{c.bike_route_type ? ` · ${c.bike_route_type === 'skole' ? 'skolerute' : 'fritidsrute'}` : ''}</span>
                </div>
                {(ownerLabel(c.road_owner) || c.speed_limit) && (
                  <div className="tkt-prop">
                    <span className="tkt-prop__k">Vei</span>
                    <span className="tkt-prop__v">{[ownerLabel(c.road_owner), c.speed_limit ? `${c.speed_limit} km/t` : null].filter(Boolean).join(' · ')}</span>
                  </div>
                )}
                {c.road_reference && (
                  <div className="tkt-prop">
                    <span className="tkt-prop__k">Vegreferanse</span>
                    <span className="tkt-prop__v tkt-prop__v--mono">{c.road_reference}</span>
                  </div>
                )}
              </div>
            </section>

            <section className="admin-section tkt-activity-card">
              <div className="tkt-activity-head">
                <h2>Aktivitet</h2>
                {support.facets.length > 0 && (
                  <div className="sak-support__facets">
                    {support.facets.map((f) => <span key={f.category} className="sak-support__facet">{f.category}<b>{f.count}</b></span>)}
                  </div>
                )}
              </div>
              <ul className="tkt-activity">
                {activity.map((a, i) => (
                  <li key={i} className={`tkt-act tkt-act--${a.type}`}>
                    <span className="tkt-act__dot" />
                    <div className="tkt-act__head">
                      <span className="tkt-act__who">{ACT_LABEL[a.type]}{a.tag ? ` · ${a.tag}` : ''}</span>
                      <span className="tkt-act__time">{fmtDate(a.at)}</span>
                    </div>
                    {a.text && <p className="tkt-act__text">{a.type === 'voice' ? `«${a.text}»` : a.text}</p>}
                  </li>
                ))}
              </ul>

              <div className="tkt-composer">
                <div className="case-admin__notetabs">
                  <button type="button" className={noteMode === 'public' ? 'case-admin__tab case-admin__tab--on' : 'case-admin__tab'} onClick={() => setNoteMode('public')}>Svar til innbygger</button>
                  <button type="button" className={noteMode === 'internal' ? 'case-admin__tab case-admin__tab--on' : 'case-admin__tab'} onClick={() => setNoteMode('internal')}>Internt notat</button>
                </div>
                <textarea className="sak-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)}
                  placeholder={noteMode === 'internal' ? 'Lim inn e-post fra kommunen, eller skriv et internt notat. Kun for ansatte.' : 'Skriv en oppdatering som vises for innbyggeren.'} />
                <button type="button" className="big-button big-button--primary" onClick={addNote} disabled={busy || note.trim().length < 2}>
                  {busy ? 'Lagrer …' : (noteMode === 'internal' ? 'Legg til notat' : 'Publiser oppdatering')}
                </button>
              </div>
            </section>

            <section className="admin-section">
              <h2>Sted</h2>
              {mapThumb && (
                <Link href={`/?sak=${encodeURIComponent(c.id)}`} className="tkt-map">
                  <img src={mapThumb} alt="Kart over stedet" />
                </Link>
              )}
              {Array.isArray(accidents) && (
                <div className="case-admin__accidents">
                  <button type="button" className="case-admin__accidents-toggle" onClick={() => setShowAcc((v) => !v)} disabled={accidents.length === 0}>
                    <span>Ulykker innen 50 m</span>
                    <span className="case-admin__accidents-count">{accidents.length}{accidents.length > 0 ? (showAcc ? ' · skjul' : ' · vis') : ''}</span>
                  </button>
                  {showAcc && accidents.length > 0 && (
                    <ul className="case-admin__accidents-list">
                      {accidents.slice(0, 12).map((a, i) => <li key={i}>{[a.year, a.type || 'Ulykke', a.severity].filter(Boolean).join(' · ')}</li>)}
                    </ul>
                  )}
                </div>
              )}
              <div className="sak-side__actions">
                <Link className="big-button big-button--secondary" href={`/?sak=${encodeURIComponent(c.id)}`}>Vis på kart</Link>
                {Number.isFinite(Number(c.lat)) && <a className="big-button big-button--secondary" href={`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${c.lat},${c.lng}`} target="_blank" rel="noopener noreferrer">Street View</a>}
              </div>
            </section>

            <section className="admin-section">
              <div className="sak-att__head">
                <h2>Vedlegg</h2>
                <div className="case-admin__notetabs sak-att__vis">
                  <button type="button" className={uploadVis === 'internal' ? 'case-admin__tab case-admin__tab--on' : 'case-admin__tab'} onClick={() => setUploadVis('internal')}>Internt</button>
                  <button type="button" className={uploadVis === 'public' ? 'case-admin__tab case-admin__tab--on' : 'case-admin__tab'} onClick={() => setUploadVis('public')}>Offentlig</button>
                </div>
              </div>
              <label
                className={dragOver ? 'sak-upload sak-upload--drag' : 'sak-upload'}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); doUpload(e.dataTransfer.files); }}
              >
                <input type="file" accept="image/*,application/pdf" multiple onChange={(e) => doUpload(e.target.files)} disabled={uploading} hidden />
                <strong>{uploading ? 'Laster opp …' : `+ Legg til ${uploadVis === 'public' ? 'offentlig' : 'internt'} vedlegg`}</strong>
                <span className="sak-upload__hint">Dra hit, eller lim inn bilde (Ctrl/Cmd + V)</span>
              </label>
              {(data.attachments || []).length > 0 && (
                <div className="sak-att__grid">
                  {data.attachments.map((a) => (
                    <div key={a.id} className={a.visibility === 'public' ? 'sak-att sak-att--public' : 'sak-att'}>
                      {isImage(a)
                        ? <button type="button" className="sak-att__thumb" onClick={() => setLightbox(a.url)}><img src={a.url} alt={a.filename || ''} /></button>
                        : <a href={a.url} target="_blank" rel="noopener noreferrer" className="sak-att__thumb"><span className="sak-att__file">PDF</span></a>}
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

            {(c.contact_name || c.contact_email || c.contact_phone) && (
              <section className="admin-section">
                <h2>Kontakt</h2>
                {c.contact_name && <p className="sak-kv"><span>Navn</span><b>{c.contact_name}</b></p>}
                {c.contact_email && <p className="sak-kv"><span>E-post</span><b><a href={`mailto:${c.contact_email}?subject=${encodeURIComponent(`Finns Fairway – ${c.category}`)}`}>{c.contact_email}</a></b></p>}
                {c.contact_phone && <p className="sak-kv"><span>Telefon</span><b><a href={`tel:${c.contact_phone}`}>{c.contact_phone}</a></b></p>}
              </section>
            )}

            {data.trelloCardUrl && (
              <footer className="sak-footer">
                <a href={data.trelloCardUrl} target="_blank" rel="noopener noreferrer">Åpne kortet i Trello ↗</a>
              </footer>
            )}

            <section className="admin-section sak-danger">
              <h2>Faresone</h2>
              {!deleteArmed ? (
                <button type="button" className="sak-danger__arm" onClick={() => setDeleteArmed(true)}>Slett denne saken …</button>
              ) : (
                <div className="sak-danger__box">
                  <p>Dette sletter saken <b>permanent</b> og kan ikke angres. Skriv <b>SLETT</b> for å bekrefte.</p>
                  <input
                    className="sak-danger__input"
                    value={deleteConfirm}
                    onChange={(e) => setDeleteConfirm(e.target.value)}
                    placeholder="SLETT"
                    autoComplete="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                  />
                  <div className="sak-danger__actions">
                    <button type="button" className="sak-danger__cancel" onClick={() => { setDeleteArmed(false); setDeleteConfirm(''); }} disabled={deleting}>Avbryt</button>
                    <button type="button" className="sak-danger__go" onClick={deleteCase} disabled={deleting || deleteConfirm.trim().toUpperCase() !== 'SLETT'}>
                      {deleting ? 'Sletter …' : 'Slett saken permanent'}
                    </button>
                  </div>
                </div>
              )}
            </section>
          </>
        )}
      </main>
      {lightbox && (
        <div className="lightbox" role="dialog" aria-modal="true" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="Vedlegg i full størrelse" />
          <button type="button" className="lightbox__close" aria-label="Lukk" onClick={() => setLightbox(null)}>✕</button>
        </div>
      )}
    </>
  );
}
