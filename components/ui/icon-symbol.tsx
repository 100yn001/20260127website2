// Fallback for using MaterialIcons on Android and web.

import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { SymbolViewProps, SymbolWeight } from 'expo-symbols';
import { ComponentProps } from 'react';
import { OpaqueColorValue, type StyleProp, type TextStyle } from 'react-native';

type IconMapping = Record<SymbolViewProps['name'], ComponentProps<typeof MaterialIcons>['name']>;
type IconSymbolName = keyof typeof MAPPING;

/**
 * Add your SF Symbols to Material Icons mappings here.
 * - see Material Icons in the [Icons Directory](https://icons.expo.fyi).
 * - see SF Symbols in the [SF Symbols](https://developer.apple.com/sf-symbols/) app.
 */
const MAPPING = {
  'house.fill': 'home',
  'paperplane.fill': 'send',
  'chevron.left.forwardslash.chevron.right': 'code',
  'chevron.right': 'chevron-right',
  'chevron.left': 'chevron-left',
  'chevron.down': 'keyboard-arrow-down',
  'chevron.up': 'keyboard-arrow-up',
  'play.fill': 'play-arrow',
  'play.circle.fill': 'play-circle-filled',
  'pause.fill': 'pause',
  bookmark: 'bookmark-border',
  'bookmark.fill': 'bookmark',
  'sun.max.fill': 'wb-sunny',
  'moon.fill': 'dark-mode',
  'moon.stars.fill': 'nightlight-round',
  'checkmark.circle.fill': 'check-circle',
  'checkmark.seal.fill': 'verified',
  checkmark: 'check',
  'globe.americas.fill': 'public',
  'arrow.right': 'arrow-forward',
  'arrow.up': 'arrow-upward',
  'arrow.clockwise.circle': 'refresh',
  'arrow.triangle.2.circlepath': 'sync',
  xmark: 'close',
  'xmark.circle.fill': 'cancel',
  plus: 'add',
  'plus.circle.fill': 'add-circle',
  trash: 'delete',
  pencil: 'edit',
  sparkles: 'auto-awesome',
  waveform: 'graphic-eq',
  'music.note': 'music-note',
  'book.fill': 'menu-book',
  'book.closed': 'book',
  'books.vertical': 'library-books',
  'person.fill': 'person',
  person: 'person-outline',
  'person.wave.2': 'people',
  'clock.fill': 'schedule',
  clock: 'schedule',
  'exclamationmark.triangle': 'warning',
  'exclamationmark.circle.fill': 'error',
  'info.circle': 'info-outline',
  'gobackward.15': 'replay-10',
  'goforward.15': 'forward-10',
  'text.bubble': 'chat-bubble-outline',
  'text.bubble.fill': 'chat-bubble',
  'questionmark.bubble': 'help-outline',
  magnifyingglass: 'search',
  ellipsis: 'more-horiz',
  'wand.and.stars': 'auto-fix-high',
  'arrow.up.left.and.arrow.down.right': 'fullscreen',
  'arrow.down.right.and.arrow.up.left': 'fullscreen-exit',
} as IconMapping;

/**
 * An icon component that uses native SF Symbols on iOS, and Material Icons on Android and web.
 * This ensures a consistent look across platforms, and optimal resource usage.
 * Icon `name`s are based on SF Symbols and require manual mapping to Material Icons.
 */
export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
  weight?: SymbolWeight;
}) {
  return <MaterialIcons color={color} size={size} name={MAPPING[name]} style={style} />;
}
