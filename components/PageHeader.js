import Link from 'next/link';
import { useRouter } from 'next/router';
import Icon from './Icon';

// One header for every sub-page (Mine meldinger, Mine turer, Aktuelt,
// Personvern, Finns bud): a round back button on the left, the page title,
// and an optional short intro underneath. Replaces the old mix of
// «‹ Tilbake», «← Til forsiden» and logo-in-card headers.
export default function PageHeader({ title, intro = null, backHref = '/' }) {
  const router = useRouter();
  const goBack = (event) => {
    if (typeof window !== 'undefined' && window.history.length > 1 && document.referrer && new URL(document.referrer).origin === window.location.origin) {
      event.preventDefault();
      router.back();
    }
  };
  return (
    <header className="ph">
      <Link href={backHref} className="ph__back" aria-label="Tilbake" onClick={goBack}>
        <Icon name="chevronLeft" size={22} strokeWidth={2.2} />
      </Link>
      <h1 className="ph__title">{title}</h1>
      {intro && <p className="ph__intro">{intro}</p>}
    </header>
  );
}
