/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from 'react-native';

const tintColorLight = '#0a7ea4';
const tintColorDark = '#fff';

export const Colors = {
  light: {
    text: '#11181C',
    background: '#fff',
    tint: tintColorLight,
    icon: '#687076',
    tabIconDefault: '#687076',
    tabIconSelected: tintColorLight,
  },
  dark: {
    text: '#ECEDEE',
    background: '#151718',
    tint: tintColorDark,
    icon: '#9BA1A6',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: tintColorDark,
  },
};

export const Fonts = {
  /** EB Garamond Regular (default body text) */
  regular: 'EBGaramond-Regular',
  /** EB Garamond Medium (headings and emphasis) */
  medium: 'EBGaramond-Medium',
  /** EB Garamond SemiBold (strong emphasis) */
  semiBold: 'EBGaramond-SemiBold',
  /** EB Garamond Bold (very strong emphasis) */
  bold: 'EBGaramond-Bold',
  /** EB Garamond Italic */
  italic: 'EBGaramond-Italic',
  /** EB Garamond Medium Italic */
  mediumItalic: 'EBGaramond-MediumItalic',
  
  // Legacy aliases for backward compatibility
  sans: 'EBGaramond-Regular',
  serif: 'EBGaramond-Regular',
  rounded: 'EBGaramond-Medium',
  mono: 'EBGaramond-Regular',
};
