import RNSlider from '@react-native-community/slider';
import { useColorScheme } from 'nativewind';
import * as React from 'react';
import { View } from 'react-native';
import { cn } from '@/lib/cn';

interface SliderProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onValueChange: (value: number) => void;
  className?: string;
}

export function Slider({
  value,
  min = 0,
  max = 10,
  step = 1,
  onValueChange,
  className,
}: SliderProps) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  // Concrete hex values — RN slider can't resolve CSS vars.
  const primary = isDark ? '#fafafa' : '#151519';
  const track = isDark ? '#2b2b2b' : '#d9dae0';

  return (
    <View className={cn('w-full', className)}>
      <RNSlider
        minimumValue={min}
        maximumValue={max}
        step={step}
        value={value}
        onValueChange={onValueChange}
        minimumTrackTintColor={primary}
        maximumTrackTintColor={track}
        thumbTintColor={primary}
      />
    </View>
  );
}
