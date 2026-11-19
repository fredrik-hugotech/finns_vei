import { useEffect, useState } from 'react';
import { FinnAvatar } from './Finn';

// Finn's fact message on a case, as a draft. Staff read and edit it, then
// publish it to the person who reported — or discard it. Never automatic.
export default function FactDraft({ caseId, onPublished }) {
  const [msg, setMsg] = useState(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => {
    setMsg(null); setErr('');
    fetch(`/api/backoffice/finn/faktamelding?id=${encodeURIComponent(caseId)}`).then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (d?.message) { setMsg(d.message); setText(d.message.message); }
    }).catch(() => {});
  }, [caseId]);
  if (!msg || msg.status !== 'utkast') return null;
  const act = async (action) => {
    if (action === 'publish' && !window.confirm('Publisere meldingen? Den vises for innbyggeren på saken.')) return;
    setBusy(action); setErr('');
    try {
      const r = await fetch('/api/backoffice/finn/faktamelding', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, id: caseId, text }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(d.error || 'Kunne ikke lagre.'); return; }
      setMsg({ ...msg, status: action === 'publish' ? 'publisert' : 'forkastet' });
      if (action === 'publish') onPublished?.();
    } finally { setBusy(''); }
  };
  return (
    <div className="fact-draft">
      <div className="fact-draft__head">
        <FinnAvatar size={28} />
        <div>
          <strong>Faktamelding fra Finn</strong>
          <span>Utkast, ikke publisert. Bare fakta om stedet, uten tiltak og lovnader. Les gjennom og rett før du publiserer.</span>
        </div>
      </div>
      <textarea className="sak-note" rows={9} value={text} onChange={(e) => setText(e.target.value)} aria-label="Faktamelding" />
      {err && <p className="notice notice--warning">{err}</p>}
      <div className="fact-draft__actions">
        <button type="button" className="big-button big-button--primary" disabled={!!busy || text.trim().length < 20} onClick={() => act('publish')}>{busy === 'publish' ? 'Publiserer …' : 'Publiser til innbygger'}</button>
        <button type="button" className="big-button big-button--secondary" disabled={!!busy} onClick={() => act('discard')}>Forkast</button>
      </div>
    </div>
  );
}
