import { useEffect, useRef, useState } from 'react';
import Icon from './Icon';

// Joins whatever the reporter already typed with the newly dictated text,
// adding a space only where one is actually needed — dictation must always
// append, never silently overwrite, existing free-text.
function appendWithSpacer(base, addition) {
  if (!addition) return base;
  const trimmedBase = base.replace(/\s+$/, '');
  if (!trimmedBase) return addition;
  return `${trimmedBase} ${addition}`;
}

// Small "speak your description" control built on the native Web Speech API
// (window.SpeechRecognition / webkitSpeechRecognition) so a reporter can
// dictate the free-text description instead of typing it — handy one-handed
// or standing at the spot. Zero new dependency, fully client-side (no server
// call, no API key), and simply absent — not broken — on browsers without
// speech support (Firefox and most non-Chromium browsers today):
// `supported` only flips true after mount, so the server render and first
// client render always match. Mirrors ReadAloudButton.js's SSR-safe
// feature-detection pattern.
export default function DictationButton({ value, onTranscript, disabled, className = '' }) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef(null);
  const baseTextRef = useRef('');
  const finalTextRef = useRef('');
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    const SpeechRecognitionCtor = typeof window !== 'undefined'
      ? (window.SpeechRecognition || window.webkitSpeechRecognition)
      : null;
    setSupported(!!SpeechRecognitionCtor);
    return () => {
      mountedRef.current = false;
      // Don't leave the mic hot after this control has left the screen
      // (unmount, closing the report sheet, etc).
      try { recognitionRef.current?.stop(); } catch (_e) { /* best effort */ }
      recognitionRef.current = null;
    };
  }, []);

  if (!supported) return null;

  const stopListening = () => {
    try { recognitionRef.current?.stop(); } catch (_e) { /* best effort */ }
  };

  const startListening = () => {
    const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) return;
    // A fresh instance every time — the simplest way to avoid stale-state
    // quirks, since a Chrome recognizer isn't reliably reusable once it has
    // stopped or errored.
    const recognition = new SpeechRecognitionCtor();
    recognition.lang = 'nb-NO';
    recognition.continuous = true;
    recognition.interimResults = true;

    baseTextRef.current = value || '';
    finalTextRef.current = '';

    recognition.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const transcript = result[0]?.transcript || '';
        if (result.isFinal) {
          finalTextRef.current = `${finalTextRef.current}${finalTextRef.current ? ' ' : ''}${transcript.trim()}`;
        } else {
          interim += transcript;
        }
      }
      const dictated = [finalTextRef.current, interim.trim()].filter(Boolean).join(' ');
      onTranscript?.(appendWithSpacer(baseTextRef.current, dictated));
    };

    // Permission denied, no mic, no speech detected, transient network
    // hiccup, etc — never surface the raw browser error. Just fall back to
    // the idle button state so the rest of the form keeps working untouched.
    recognition.onerror = () => {
      if (mountedRef.current) setListening(false);
    };
    recognition.onend = () => {
      if (mountedRef.current) setListening(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
      setListening(true);
    } catch (_e) {
      setListening(false);
    }
  };

  const toggle = () => {
    if (listening) stopListening();
    else startListening();
  };

  return (
    <button
      type="button"
      className={`dictation-btn${listening ? ' dictation-btn--listening' : ''}${className ? ` ${className}` : ''}`}
      onClick={toggle}
      disabled={disabled}
      aria-pressed={listening}
      aria-label={listening ? 'Stopp diktering' : 'Snakk inn beskrivelse'}
    >
      <Icon name="mic" size={15} strokeWidth={2} />
      <span>{listening ? 'Lytter…' : 'Snakk inn'}</span>
    </button>
  );
}
