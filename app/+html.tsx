import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

// Custom HTML wrapper for the static-rendered web build. Forces the document
// to a black background from the very first paint so the page never flashes
// white between route transitions or while the React tree mounts.
export default function Root({ children }: PropsWithChildren) {
  // Keep the favicon in sync with 20260127website2-main/index.html so the
  // tab icon is identical on the landing page and every /app route.
  const faviconSvg =
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'>" +
    "<rect width='100' height='100' fill='black'/>" +
    "<text x='50%' y='58%' dominant-baseline='middle' text-anchor='middle' " +
    "font-family='EB Garamond, serif' font-size='78' fill='white'>{yn}</text>" +
    '</svg>';
  const faviconHref = `data:image/svg+xml,${encodeURIComponent(faviconSvg)}`;

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <meta name="theme-color" content="#000000" />
        <link rel="icon" href={faviconHref} />
        <link rel="shortcut icon" href={faviconHref} />
        <link rel="apple-touch-icon" href={faviconHref} />
        <ScrollViewStyleReset />
        <style
          dangerouslySetInnerHTML={{
            __html: `
              html, body, #root { background-color: #000 !important; }
              html, body { color-scheme: dark; }
            `,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
