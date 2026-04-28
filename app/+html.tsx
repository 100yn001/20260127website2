import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

// Custom HTML wrapper for the static-rendered web build. Forces the document
// to a black background from the very first paint so the page never flashes
// white between route transitions or while the React tree mounts.
//
// Favicon: served from /public/icon.png, which Expo Router exposes under the
// configured baseUrl at /app/icon.png. Mirrors 20260127website2-main so the
// tab icon matches across the landing page and every /app route.
export default function Root({ children }: PropsWithChildren) {
  const faviconHref = '/app/icon.png';

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
              input, textarea, select, button { outline: none !important; -webkit-tap-highlight-color: transparent; }
              input:focus, textarea:focus, select:focus, button:focus { outline: none !important; box-shadow: none !important; }
            `,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
