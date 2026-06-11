import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import { useState } from 'react';

const ReportMap = dynamic(() => import('./ReportMap'), {
  ssr: false,
  loading: () => <div className="map-missing">Laster kart...</div>,
});

export default function MapExperience() {
  const router = useRouter();
  const [isReportChoiceOpen, setIsReportChoiceOpen] = useState(false);

  const startReport = (type) => {
    setIsReportChoiceOpen(false);
    router.push(`/meld/form?type=${type}`);
  };

  return (
    <main className="map-page">
      <ReportMap className="map-canvas" enableNvdbLayers />
      <section className="map-header map-overlay" aria-label="Kartnavigasjon">
        <h1>Finns.Vei</h1>
      </section>
      <button className="report-start-button" type="button" onClick={() => setIsReportChoiceOpen(true)}>
        Si fra
      </button>

      {isReportChoiceOpen && (
        <div className="report-choice-backdrop" role="presentation" onClick={() => setIsReportChoiceOpen(false)}>
          <section className="report-choice-sheet" role="dialog" aria-modal="true" aria-labelledby="report-choice-title" onClick={(event) => event.stopPropagation()}>
            <button className="report-choice-close" type="button" aria-label="Lukk" onClick={() => setIsReportChoiceOpen(false)}>×</button>
            <h2 id="report-choice-title">Hvem melder?</h2>
            <div className="report-choice-actions">
              <button className="big-button big-button--primary" type="button" onClick={() => startReport('barn')}>Barn</button>
              <button className="big-button big-button--secondary" type="button" onClick={() => startReport('voksen')}>Voksen</button>
            </div>
            <small>Ingen innlogging</small>
          </section>
        </div>
      )}
    </main>
  );
}
