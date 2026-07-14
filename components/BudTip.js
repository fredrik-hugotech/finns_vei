import Link from 'next/link';
import { useEffect, useState } from 'react';
import { SAFETY_COMMANDMENTS, KID_COMMANDMENTS } from '../lib/safetyCommandments';
import ReadAloudButton from './ReadAloudButton';

function listFor(audience) {
  return audience === 'barn'
    ? KID_COMMANDMENTS
    : audience === 'voksen'
      ? SAFETY_COMMANDMENTS.filter((b) => b.audience === 'voksen')
      : SAFETY_COMMANDMENTS;
}

// Reads (but does not advance) the rotation index for `key`. Pure - safe to
// call during render (e.g. from a useState lazy initializer).
function peekIndex(key) {
  if (typeof window === 'undefined') return 0;
  try {
    return parseInt(window.localStorage.getItem(key) || '0', 10) || 0;
  } catch (_e) {
    return 0;
  }
}

// Advances the rotation index for `key` so the next mount shows the next
// commandment. This is a side effect, so it must only ever be called from a
// useEffect (after the render has actually committed) - never from a render-time
// useState initializer, which React 18 StrictMode double-invokes and which can
// also run for a render pass that gets thrown away.
function advanceIndex(key, listLength) {
  if (typeof window === 'undefined') return;
  try {
    const idx = parseInt(window.localStorage.getItem(key) || '0', 10) || 0;
    window.localStorage.setItem(key, String((idx + 1) % listLength));
  } catch (_e) { /* ignore */ }
}

// One rotating "Finns bud" tip card + a link to all ten. Reused on the trip
// celebration and the report-sent confirmation. audience: 'barn' | 'voksen' | 'all'.
export default function BudTip({ audience = 'all' }) {
  const list = listFor(audience);
  const storageKey = `ff-bud-idx-${audience}`;
  const [bud] = useState(() => list[peekIndex(storageKey) % list.length]);

  useEffect(() => {
    advanceIndex(storageKey, list.length);
    // Only ever advance once, right after mount - not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!bud) return null;
  return (
    <>
      <div className="trip-cheer__bud">
        <span className="trip-cheer__bud-label">Finns bud {bud.n}</span>
        <strong>{bud.title}</strong>
        <p>{bud.text}</p>
        <ReadAloudButton text={`Finns bud ${bud.n}. ${bud.title}. ${bud.text}`} />
      </div>
      <Link href="/bud" className="trip-cheer__budlink">Se alle 10 bud ›</Link>
    </>
  );
}
