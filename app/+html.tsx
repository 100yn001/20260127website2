import { ScrollViewStyleReset } from 'expo-router/html';
import { Image } from 'react-native';
import type { PropsWithChildren } from 'react';

import iconImage from '../assets/images/icon2.png';

// Custom HTML wrapper for the static-rendered web build. Forces the document
// to a black background from the very first paint so the page never flashes
// white between route transitions or while the React tree mounts.
export default function Root({ children }: PropsWithChildren) {
  const resolved = Image.resolveAssetSource(iconImage as any);
  const faviconHref = resolved?.uri || (iconImage as unknown as string);

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
