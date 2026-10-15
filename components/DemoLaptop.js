import { useEffect, useRef, useState } from 'react';

// The backoffice dashboard in a laptop frame for the /demo tour's closing
// step. It is the real page (same origin, so the presenter's own login
// applies); not logged in shows the login screen.
const W = 1280;
const H = 800;

export default function DemoLaptop({ src = '/backoffice' }) {
  const [scale, setScale] = useState(0.6);
  const frameRef = useRef(null);
  // The page inside may grab focus (the login form autofocuses). It is our
  // own origin, so forward its key presses to the tour and hand focus back,
  // so the arrow keys / presentation clicker keep working on this step.
  const onFrameLoad = () => {
    const win = frameRef.current?.contentWindow;
    if (!win) return;
    try {
      win.addEventListener('keydown', (e) => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: e.key, bubbles: true, cancelable: true }));
      });
      win.document.activeElement?.blur?.();
    } catch (_e) { /* cross-origin: ignore */ }
    frameRef.current.blur();
    window.focus();
  };
  useEffect(() => {
    const fit = () => {
      const narrowW = window.innerWidth < 900;
      const maxW = window.innerWidth * (narrowW ? 0.94 : 0.64);
      const maxH = window.innerHeight * (narrowW ? 0.5 : 0.78);
      setScale(Math.min(maxW / (W + 36), maxH / (H + 60), 1));
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
  return (
    <div className="dl">
      <div className="dl__frame" style={{ width: (W + 36) * scale, height: (H + 60) * scale }}>
        <div className="dl__lid" style={{ transform: `scale(${scale})` }}>
          <div className="dl__screen">
            {/* inert: the page inside can't take focus (the login form autofocuses),
                so the arrow keys keep driving the tour. */}
            <iframe ref={frameRef} onLoad={onFrameLoad} className="dl__iframe" src={src} title="Backoffice" width={W} height={H} inert tabIndex={-1} />
          </div>
          <div className="dl__base" />
        </div>
      </div>
    </div>
  );
}
