import { useEffect, useState } from 'react';

// The backoffice dashboard in a laptop frame for the /demo tour's closing
// step. It is the real page (same origin, so the presenter's own login
// applies); not logged in shows the login screen.
const W = 1280;
const H = 800;

export default function DemoLaptop({ src = '/backoffice' }) {
  const [scale, setScale] = useState(0.6);
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
            <iframe className="dl__iframe" src={src} title="Backoffice" width={W} height={H} />
          </div>
          <div className="dl__base" />
        </div>
      </div>
    </div>
  );
}
