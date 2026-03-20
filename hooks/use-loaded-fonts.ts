import {
  useFonts,
  EBGaramond_400Regular,
  EBGaramond_500Medium,
  EBGaramond_600SemiBold,
} from '@expo-google-fonts/eb-garamond';

export function useLoadedFonts() {
  const [loaded, error] = useFonts({
    'EBGaramond-Regular': EBGaramond_400Regular,
    'EBGaramond-Medium': EBGaramond_500Medium,
    'EBGaramond-SemiBold': EBGaramond_600SemiBold,
  });

  if (error) {
    console.error('Error loading fonts:', error);
  }

  return loaded;
}
