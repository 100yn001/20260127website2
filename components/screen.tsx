import { ArrowLeft, ArrowRight } from 'lucide-react-native';
import * as React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
  type ViewProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ModeAura, type Mode } from '@/components/mode-aura';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';

/* ---------- Screen shell -------------------------------------------------- */

export function Screen({
  children,
  className,
  mode,
  auraIntensity = 'subtle',
  wide = false,
}: {
  children: React.ReactNode;
  className?: string;
  mode?: Mode;
  auraIntensity?: 'full' | 'subtle';
  wide?: boolean;
}) {
  return (
    <View className="flex-1 bg-background relative">
      {mode && <ModeAura mode={mode} intensity={auraIntensity} />}
      <SafeAreaView
        edges={['top']}
        className={cn(
          'flex-1 self-center w-full',
          // Mobile-first column, but give tablets/desktop more room so the app
          // isn't a skinny 440px strip on iPad/Mac.
          wide ? 'max-w-[1200px]' : 'max-w-[440px] md:max-w-[600px]',
          className
        )}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
          {children}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

/* ---------- TopBar with back + progress + right slot --------------------- */

export function TopBar({
  onBack,
  backIcon,
  backLabel,
  step,
  total,
  right,
}: {
  onBack?: () => void;
  backIcon?: React.ReactNode;
  backLabel?: string;
  step?: number;
  total?: number;
  right?: React.ReactNode;
}) {
  return (
    <View className="flex-row items-center gap-3 px-5 pt-5 pb-3">
      {onBack ? (
        <Pressable
          onPress={onBack}
          className="h-9 w-9 -ml-2 items-center justify-center rounded-full active:bg-accent"
          accessibilityLabel={backLabel ?? 'back'}
        >
          {backIcon ?? <ArrowLeft size={18} color="hsl(var(--foreground))" />}
        </Pressable>
      ) : (
        <View className="h-9 w-9 -ml-2" />
      )}

      {step != null && total != null ? (
        <View className="flex-1 flex-row items-center gap-1.5">
          {Array.from({ length: total }).map((_, i) => (
            <View
              key={i}
              className={cn(
                'h-[3px] flex-1 rounded-full',
                i < step ? 'bg-primary' : 'bg-border'
              )}
            />
          ))}
        </View>
      ) : (
        <View className="flex-1" />
      )}

      {right ? (
        <View className="h-9 flex-row items-center">{right}</View>
      ) : null}
    </View>
  );
}

/* ---------- Header: title + subtitle ------------------------------------- */

export function ScreenHeader({
  title,
  subtitle,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  className?: string;
}) {
  return (
    <View className={cn('', className)}>
      <Text className="text-[1.65rem] leading-tight font-serif-medium text-foreground">
        {title}
      </Text>
      {subtitle ? (
        <Text className="mt-1.5 text-[0.95rem] font-serif text-foreground/70">{subtitle}</Text>
      ) : null}
    </View>
  );
}

/* ---------- FlowCluster: vertically-centered group ------------------------ */

export function FlowCluster({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ flexGrow: 1 }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View
        className={cn(
          'flex-1 justify-center gap-5 px-6 pt-4 pb-20',
          className
        )}
      >
        {children}
      </View>
    </ScrollView>
  );
}

/* ---------- Screen body (non-centered, for chat etc.) -------------------- */

export function ScreenBody({ children, className, ...props }: ViewProps & { className?: string }) {
  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ flexGrow: 1 }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View className={cn('flex-1 px-6 pb-24', className)} {...props}>
        {children}
      </View>
    </ScrollView>
  );
}

export function ScreenFooter({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return <View className={cn('px-5 pt-4 pb-6', className)}>{children}</View>;
}

/* ---------- Continue button ---------------------------------------------- */

export function ContinueButton({
  onPress,
  disabled,
  children,
}: {
  onPress: () => void;
  disabled?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <Button onPress={onPress} disabled={disabled} size="lg" className="w-full">
      {children ?? 'continue'}
      <ArrowRight size={18} color="hsl(var(--primary-foreground))" />
    </Button>
  );
}
