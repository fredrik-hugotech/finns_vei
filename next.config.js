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
    // framing outright rather than allowlist.
    //
    // Content-Security-Policy (2026-08-18): allowlisted against everything
    // this app actually loads client-side, checked file-by-file rather than
    // guessed —
    //   - Mapbox GL JS (components/ReportMap.js): npm package bundled into
    //     the app's own JS (no external script host needed), but it fetches
    //     tiles/styles/glyphs/sprites from api.mapbox.com and reports usage
    //     to events.mapbox.com, spins up a worker via a blob: URL, and
    //     Mapbox's own CSP guidance calls for child-src/worker-src blob:.
    //   - Mapbox static images and geocoding (components/ReportSheet.js,
    //     pages/backoffice/sak/[id].js) and the Directions API called
    //     client-side from the seed-spor demo tool
    //     (pages/backoffice/seed-spor.js) — same api.mapbox.com host, for
    //     img-src and connect-src respectively.
    //   - next/font/google (pages/_app.js, Fraunces + Mulish) self-hosts the
    //     actual font files at build time — no fonts.googleapis.com/
    //     fonts.gstatic.com request happens at runtime, so font-src 'self'
    //     is sufficient and no external font host is allowlisted.
    //   - styled-jsx (used throughout) injects <style> tags at runtime
    //     without a nonce in this setup, so style-src needs 'unsafe-inline'
    //     — a known, accepted tradeoff for Next.js apps on styled-jsx
    //     without extra nonce plumbing; script-src does NOT get the same
    //     allowance.
    //   - Supabase Storage (report/attachment images, on the same project
    //     host) needs an img-src entry; the exact subdomain is read from
    //     NEXT_PUBLIC_SUPABASE_URL at build time rather than hardcoded, so
    //     this keeps working if the Supabase project ever changes.
    //   - api.openai.com, api.resend.com, api.trello.com,
    //     nvdbapiles.atlas.vegvesen.no, api.met.no are all called
    //     server-side only (API routes) — CSP governs the browser, not
    //     server-to-server fetches, so none of these need allowlisting here.
    // Re-verified 2026-08-23 (headless Chromium against a local `next start`
    // build, since Vercel Authentication blocks headless access to preview
    // URLs) after several nights of unrelated `main` changes landed on this
    // branch, including the removal of the /tryggeste-skolevei page this
    // comment used to reference — checked /, /map, /sykle, /bud and
    // /backoffice for console CSP violations (none), plus an independent
    // audit of every external host referenced anywhere client-side against
    // this allowlist. See reports/nightly/2026-08-23.md.
    const supabaseHost = (() => {
      try { return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host; } catch (_e) { return null; }
    })();
    const csp = [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      `img-src 'self' data: blob: https://api.mapbox.com${supabaseHost ? ` https://${supabaseHost}` : ''}`,
      "font-src 'self'",
      `connect-src 'self' https://api.mapbox.com https://events.mapbox.com${supabaseHost ? ` https://${supabaseHost}` : ''}`,
      "worker-src 'self' blob:",
      "child-src blob:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join('; ');
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Content-Security-Policy', value: csp },
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
