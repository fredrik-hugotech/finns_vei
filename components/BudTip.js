import Link from 'next/link';
import { useState } from 'react';
import { SAFETY_COMMANDMENTS, KID_COMMANDMENTS, ADULT_COMMANDMENTS } from '../lib/safetyCommandments';

// Rotate through a list per device so a new commandment shows each time.
function rotate(list, key) {
  let idx = 0;
  if (typeof window !== 'undefined') {
    try {
      idx = parseInt(window.localStorage.getItem(key) || '0', 10) || 0;
      window.localStorage.setItem(key, String((idx + 1) % list.length));
    } catch (_e) { /* ignore */ }
  }
  return list[idx % list.length];
}

// One rotating "Finns bud" tip card + a link to all ten. Reused on the trip
// celebration and the report-sent confirmation. audience: 'barn' | 'voksen' | 'all'.
export default function BudTip({ audience = 'all' }) {
  const [bud] = useState(() => {
    const list = audience === 'barn'
      ? KID_COMMANDMENTS
      : audience === 'voksen'
        ? ADULT_COMMANDMENTS
        : SAFETY_COMMANDMENTS;
    return rotate(list, `ff-bud-idx-${audience}`);
  });
  if (!bud) return null;
  return (
    <>
      <div className="trip-cheer__bud">
        <span className="trip-cheer__bud-label">Finns bud {bud.n}</span>
        <strong>{bud.title}</strong>
        <p>{bud.text}</p>
      </div>
      <Link href="/bud" className="trip-cheer__budlink">Se alle 10 bud ›</Link>
    </>
  );
}
