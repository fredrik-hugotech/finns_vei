import Link from 'next/link';
import { useState } from 'react';
import { KID_QUIZ } from '../lib/safetyCommandments';

// A quick, fun "sant eller usant" mini-quiz drawn from Finns 10 bud, shown
// occasionally right after a trip (see TripCelebration) so the safety message
// lands while it's still top of mind — a memorable moment instead of just a
// passive tip. Fully client-side: nothing is scored or persisted anywhere
// (no localStorage counter, no API call); this is a momentary teaching moment,
// not a tracked mechanic. It never blocks the flow — the celebration screen's
// own "Ferdig" button keeps working whether or not a kid answers.
export default function BudQuiz() {
  const [item] = useState(() => {
    if (!KID_QUIZ || KID_QUIZ.length === 0) return null;
    return KID_QUIZ[Math.floor(Math.random() * KID_QUIZ.length)];
  });
  // Randomly ask about the true or the false phrasing of the same bud, so the
  // correct answer isn't always "Sant".
  const [askTrue] = useState(() => Math.random() < 0.5);
  const [answer, setAnswer] = useState(null); // null | true | false

  if (!item) return null;

  const statement = askTrue ? item.true : item.false;
  const correctChoice = askTrue; // "Sant" is correct iff we're showing the true phrasing
  const answered = answer !== null;
  const isCorrect = answered && answer === correctChoice;

  return (
    <div className="trip-cheer__bud trip-cheer__quiz">
      <span className="trip-cheer__bud-label">Sant eller usant?</span>
      <p className="trip-cheer__quiz-statement">{statement}</p>

      {!answered && (
        <div className="kid-choice trip-cheer__quiz-choices">
          <button type="button" className="kid-pick trip-cheer__quiz-pick" onClick={() => setAnswer(true)}>
            <span>Sant</span>
          </button>
          <button type="button" className="kid-pick trip-cheer__quiz-pick" onClick={() => setAnswer(false)}>
            <span>Usant</span>
          </button>
        </div>
      )}

      {answered && (
        <p className={isCorrect ? 'trip-cheer__quiz-feedback trip-cheer__quiz-feedback--ok' : 'trip-cheer__quiz-feedback trip-cheer__quiz-feedback--wrong'}>
          {isCorrect ? 'Riktig!' : `Nesten! Husk: ${item.true}`}
        </p>
      )}

      <Link href="/bud" className="trip-cheer__budlink">Se alle 10 bud ›</Link>
    </div>
  );
}
