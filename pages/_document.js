import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="nb">
      <Head>
        <link rel="icon" href="/brand/finns-vei-mark.svg" type="image/svg+xml" />
        <meta name="theme-color" content="#f4c542" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
