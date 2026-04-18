import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

// Custom HTML wrapper for the static-rendered web build. Forces the document
// to a black background from the very first paint so the page never flashes
// white between route transitions or while the React tree mounts.
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <meta name="theme-color" content="#000000" />
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
