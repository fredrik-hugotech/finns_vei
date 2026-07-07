import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="nb">
      <Head>
        <link rel="icon" href="/brand/icon-192.png" type="image/png" sizes="192x192" />
        <link rel="icon" href="/brand/finns-fairway-mark.svg" type="image/svg+xml" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="apple-touch-icon" href="/brand/icon-180.png" />
        <meta name="theme-color" content="#0b5d4d" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Finns Fairway" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
