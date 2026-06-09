import dynamic from 'next/dynamic';

const Map = dynamic(() => import('../components/Map'), {
  ssr: false,
  loading: () => <div style={{ padding: 16 }}>Laster kart...</div>,
});

export default function Home() {
  return <Map />;
}
