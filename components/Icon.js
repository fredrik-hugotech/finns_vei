// Lightweight inline-SVG icon set (Lucide-style stroke icons) so the whole
// solution shares one clean, consistent visual language without an extra
// dependency or emoji. All icons are 24x24, inherit `currentColor`.

const ICONS = {
  bike: (
    <>
      <circle cx="5.5" cy="17.5" r="3.5" />
      <circle cx="18.5" cy="17.5" r="3.5" />
      <circle cx="15" cy="5" r="1" />
      <path d="M12 17.5V14l-3-3 4-3 2 3h2" />
    </>
  ),
  flag: (
    <>
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" y1="22" x2="4" y2="15" />
    </>
  ),
  map: (
    <>
      <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z" />
      <line x1="9" y1="4" x2="9" y2="18" />
      <line x1="15" y1="6" x2="15" y2="20" />
    </>
  ),
  school: (
    <>
      <path d="m4 6 8-4 8 4" />
      <path d="m18 10 4 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-8l4-2" />
      <path d="M14 22v-4a2 2 0 0 0-2-2 2 2 0 0 0-2 2v4" />
      <path d="M6 5v17M18 5v17" />
      <circle cx="12" cy="9" r="2" />
    </>
  ),
  activity: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3a9 9 0 0 0 0 18M3 12h18M5.6 6.5C8 8 16 8 18.4 6.5M5.6 17.5C8 16 16 16 18.4 17.5" />
    </>
  ),
  helmet: (
    <>
      <path d="M3 16a9 9 0 0 1 18 0" />
      <path d="M2 16h20v1a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z" />
      <path d="M10 7.2V16M14 7.2V16" />
    </>
  ),
  stop: (
    <>
      <circle cx="12" cy="12" r="9" />
      <rect x="9" y="9" width="6" height="6" rx="1" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 15.5 14" />
    </>
  ),
  route: (
    <>
      <circle cx="6" cy="19" r="2.5" />
      <circle cx="18" cy="5" r="2.5" />
      <path d="M8.5 19h7a3.5 3.5 0 0 0 0-7h-7a3.5 3.5 0 0 1 0-7h7" />
    </>
  ),
  trophy: (
    <>
      <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" />
      <path d="M17 5h2.5a2 2 0 0 1 0 4H17M7 5H4.5a2 2 0 0 0 0 4H7" />
      <path d="M9 18h6M12 14v4M8 22h8" />
    </>
  ),
  walk: (
    <>
      <circle cx="13" cy="4" r="1.8" />
      <path d="M10.5 21l2-6-2.5-2.5 1-5 3.5 3 3 1" />
      <path d="M10.5 7.5 7 9.5 6 13" />
      <path d="M12.5 15l3 6" />
    </>
  ),
  ball: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m12 7.2 4.2 3-1.6 5H9.4l-1.6-5z" />
      <path d="M12 3v4.2M3.4 10.2l4.4.1M20.6 10.2l-4.4.1M6.4 19.4l3-4.2M17.6 19.4l-3-4.2" />
    </>
  ),
  chevronLeft: <path d="m15 18-6-6 6-6" />,
  chevronRight: <path d="m9 18 6-6-6-6" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  news: (
    <>
      <path d="M4 5h13v14a2 2 0 0 0 2 2H6a2 2 0 0 1-2-2z" />
      <path d="M17 9h3v10a2 2 0 0 1-2 2" />
      <path d="M8 9h5M8 13h5M8 17h3" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </>
  ),
  inbox: (
    <>
      <path d="M3 13h5l1.5 3h5L16 13h5" />
      <path d="M5.5 5h13L21 13v5.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5V13z" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3 4.5 6v6c0 4.6 3.2 7.7 7.5 9 4.3-1.3 7.5-4.4 7.5-9V6z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  lock: (
    <>
      <rect x="4.5" y="10.5" width="15" height="10" rx="2" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
    </>
  ),
  camera: (
    <>
      <path d="M4 8h3l2-2.5h6L17 8h3a1 1 0 0 1 1 1v9.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
      <circle cx="12" cy="13" r="3.5" />
    </>
  ),
  image: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="m20.5 16-5-5-8.5 8.5" />
    </>
  ),
  download: <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 20h14" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  plus: <path d="M12 5v14M5 12h14" />,
  bud: (
    <>
      <path d="M6 3.5h9.5L19 7v13.5H6z" />
      <path d="M15.5 3.5V7H19M9 11h7M9 14.5h7M9 18h4" />
    </>
  ),
  check: <polyline points="20 6 9 17 4 12" />,
  share: (
    <>
      <circle cx="18" cy="5" r="2.6" />
      <circle cx="6" cy="12" r="2.6" />
      <circle cx="18" cy="19" r="2.6" />
      <path d="M8.3 10.8l7.4-4.4M8.3 13.2l7.4 4.4" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  volume: (
    <>
      <path d="M4 9v6h4l5 4V5L8 9H4Z" />
      <path d="M16.2 8.8a5 5 0 0 1 0 6.4" />
      <path d="M18.8 6.2a8.8 8.8 0 0 1 0 11.6" />
    </>
  ),
};

export default function Icon({ name, size = 20, strokeWidth = 1.8, className, ...rest }) {
  const glyph = ICONS[name];
  if (!glyph) return null;
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {glyph}
    </svg>
  );
}
