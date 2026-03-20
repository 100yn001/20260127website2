import { Platform, useWindowDimensions } from 'react-native';

/**
 * Responsive layout hook for web.
 *
 * Returns the effective content width the app should render into,
 * plus breakpoint flags so screens can adapt grids, spacing, etc.
 *
 * Breakpoints (web only — native always returns full viewport):
 *   mobile   : viewport < 600px  → full width
 *   tablet   : 600–899px         → viewport − 48px padding
 *   desktop  : ≥ 900px           → 700px centered column
 */
export function useContentWidth() {
  const { width: viewportWidth } = useWindowDimensions();

  if (Platform.OS !== 'web') {
    return {
      contentWidth: viewportWidth,
      viewportWidth,
      isDesktop: false,
      isTablet: false,
      isMobile: true,
    };
  }

  const isDesktop = viewportWidth >= 900;
  const isTablet = viewportWidth >= 600 && viewportWidth < 900;
  const isMobile = viewportWidth < 600;

  let contentWidth: number;
  if (isDesktop) {
    contentWidth = 700;
  } else if (isTablet) {
    contentWidth = viewportWidth - 48;
  } else {
    contentWidth = viewportWidth;
  }

  return { contentWidth, viewportWidth, isDesktop, isTablet, isMobile };
}

/**
 * Calculate grid card dimensions for a given content width.
 */
export function getGridDimensions(
  contentWidth: number,
  columns: number,
  horizontalPadding: number,
  gap: number,
) {
  const availableWidth = contentWidth - horizontalPadding * 2 - gap * (columns - 1);
  const cardWidth = availableWidth / columns;
  return { cardWidth, cardHeight: cardWidth };
}
