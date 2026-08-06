/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      { source: '/map', destination: '/', permanent: false },
      { source: '/meld', destination: '/', permanent: false },
      { source: '/meld/form', destination: '/', permanent: false },
    ];
  },
  async headers() {
    // No page in this app is meant to be framed by another origin (the
    // backoffice staff login/actions are the sensitive case), so deny
    // framing outright rather than allowlist. A full CSP is a separate,
    // more involved follow-up (Mapbox GL, next/font, styled-jsx all need
    // careful allowlisting) and deliberately left out of this pass.
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
