import RNSlider from '@react-native-community/slider';
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
  return (
    <View className={cn('w-full', className)}>
      <RNSlider
        minimumValue={min}
        maximumValue={max}
        step={step}
        value={value}
        onValueChange={onValueChange}
        minimumTrackTintColor="hsl(var(--primary))"
        maximumTrackTintColor="hsl(var(--border))"
        thumbTintColor="hsl(var(--primary))"
      />
    </View>
  );
}
