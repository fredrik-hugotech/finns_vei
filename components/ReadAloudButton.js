import { useEffect, useRef, useState } from 'react';
import Icon from './Icon';

// Prefers an installed Norwegian voice (Bokmål first, then any nb/no/nn
// variant); returns null so the caller can fall back to the browser's own
// default voice for the utterance's language when none is installed.
function pickNorwegianVoice(voices) {
  return (
    voices.find((v) => /^(nb|no)-NO$/i.test(v.lang)) ||
    voices.find((v) => /^(nb|no|nn)\b/i.test(v.lang)) ||
    null
  );
}

// Chrome (and some other browsers) load the voice list asynchronously, so
// `getVoices()` can return an empty array on first use. Wait once for the
// `voiceschanged` event, with a short safety timeout for browsers that never
// fire it, instead of silently reading an empty list.
function getVoicesWhenReady(synth) {
  return new Promise((resolve) => {
    const existing = synth.getVoices();
    if (existing && existing.length > 0) {
      resolve(existing);
      return;
    }
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      synth.removeEventListener('voiceschanged', finish);
      resolve(synth.getVoices());
    };
    synth.addEventListener('voiceschanged', finish);
    setTimeout(finish, 300);
  });
}

// Small "read this bud aloud" control built on the native Web Speech API
// (window.speechSynthesis) so younger kids who can't read fluently yet can
// still hear each commandment. Zero new dependency, fully client-side (no
// server call, no API key), and simply absent — not broken — during SSR or
// on browsers without speech support: `supported` only flips true after
// mount, so the server render and first client render always match.
export default function ReadAloudButton({ text, label = 'Hør på meg', className = '' }) {
  const [supported, setSupported] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const mountedRef = useRef(false);
  // Guards the race where speak() is still awaiting the voice list (up to
  // ~300ms) when the user taps "Stopp": stop() flips this to false so the
  // pending speak() call bails out instead of starting playback right after
  // the button has already flipped back to "Hør på meg".
  const shouldSpeakRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    setSupported(typeof window !== 'undefined' && 'speechSynthesis' in window);
    return () => {
      mountedRef.current = false;
      // Don't let a bud keep talking after this control has left the screen
      // (unmount, navigating away from /bud, etc).
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  if (!supported || !text) return null;

  function stop() {
    shouldSpeakRef.current = false;
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }

  async function speak() {
    const synth = window.speechSynthesis;
    synth.cancel(); // stop any other bud that might still be reading
    shouldSpeakRef.current = true;
    setSpeaking(true);
    const voices = await getVoicesWhenReady(synth);
    if (!mountedRef.current || !shouldSpeakRef.current) return;
    const voice = pickNorwegianVoice(voices);
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = voice ? voice.lang : 'nb-NO';
    if (voice) utterance.voice = voice;
    utterance.onend = () => {
      if (mountedRef.current) setSpeaking(false);
    };
    utterance.onerror = () => {
      if (mountedRef.current) setSpeaking(false);
    };
    synth.speak(utterance);
  }

  function toggle() {
    if (speaking) stop();
    else speak();
  }

  return (
    <button
      type="button"
      className={`bud-read-btn${speaking ? ' bud-read-btn--speaking' : ''}${className ? ` ${className}` : ''}`}
      onClick={toggle}
      aria-pressed={speaking}
    >
      <Icon name={speaking ? 'stop' : 'volume'} size={16} strokeWidth={2} />
      <span>{speaking ? 'Stopp' : label}</span>
    </button>
  );
}
