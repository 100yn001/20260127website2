import { Platform, ViewStyle } from 'react-native';

/**
 * Cross-platform shadow style that uses boxShadow on web
 * and native shadow* properties on iOS/Android.
 */
export function createShadow(
  color: string = '#000',
  offsetX: number = 0,
  offsetY: number = 2,
  radius: number = 4,
  opacity: number = 0.15,
  elevation: number = 3,
): ViewStyle {
  if (Platform.OS === 'web') {
    return {
      // @ts-ignore — react-native-web supports boxShadow
      boxShadow: `${offsetX}px ${offsetY}px ${radius}px rgba(0,0,0,${opacity})`,
    };
  }
  return {
    shadowColor: color,
    shadowOffset: { width: offsetX, height: offsetY },
    shadowOpacity: opacity,
    shadowRadius: radius,
    elevation,
  };
}
