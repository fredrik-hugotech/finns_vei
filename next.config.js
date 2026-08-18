/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Next 16's `next dev` auto-writes an "agent rules" block into CLAUDE.md
  // on every dev-server start (see generate-agent-files.js) — useful in
  // general, but CLAUDE.md here is explicitly Fredrik's own curated
  // standing-instructions file, not a place for a vendor tool to
  // auto-append content. Disabled so it stays exactly what he wrote.
  agentRules: false,
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
          // The site is only ever served over HTTPS (Vercel's own TLS
          // termination), but nothing previously told browsers to *require*
          // that for future visits — a user who once reaches a plain-http
          // URL (a stale bookmark, a typed-in address, a captive portal
          // redirect) would get a normal, interceptable http request instead
          // of an automatic upgrade. `includeSubDomains` is safe here since
          // every subdomain actually in use (the apex + Vercel's own
          // preview/production hosts) is HTTPS-only already. `preload` is
          // deliberately omitted — submitting to the browser preload list is
          // effectively a one-way door and not something to opt into from an
          // automated pass.
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
