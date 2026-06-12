import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="nb">
      <Head>
        <link rel="icon" href="/brand/finns-fairway-mark.svg" type="image/svg+xml" />
        <meta name="theme-color" content="#0b5d4d" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
