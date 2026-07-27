/**
 * Paywall sheet — shown when a user without allowance tries to generate.
 *
 * Opens two ways:
 *  - a queue item lands in 'payment_required' (server-side entitlement check)
 *  - imperatively via DeviceEventEmitter.emit(OPEN_PAYWALL_EVENT) from
 *    pre-checks (e.g. followup's generate button)
 *
 * Mounted once in app/_layout.tsx inside the providers.
 */

import React, { useEffect, useState } from 'react';
import { DeviceEventEmitter, Modal, Pressable, Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useStoryQueue } from '@/contexts/StoryQueueContext';
import {
  FREE_STORY_LIMIT,
  isSubscribed,
  MONTHLY_PRICE_LABEL,
  MONTHLY_STORY_LIMIT,
  startSubscriptionCheckout,
} from '@/services/entitlements-service';

export const OPEN_PAYWALL_EVENT = 'openPaywall';

export function PaywallSheet() {
  const { user } = useAuth();
  const { paymentRequiredItem, entitlements } = useStoryQueue();
  const [open, setOpen] = useState(false);
  const [dismissedItemId, setDismissedItemId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const subscribed = entitlements ? isSubscribed(entitlements) : false;

  // Open when a queue item is blocked on payment (once per item until dismissed).
  const hadBlockedItemRef = React.useRef(false);
  useEffect(() => {
    if (paymentRequiredItem && paymentRequiredItem.id !== dismissedItemId) {
      hadBlockedItemRef.current = true;
      setOpen(true);
    }
  }, [paymentRequiredItem?.id, dismissedItemId]);

  // Imperative open (pre-checks).
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(OPEN_PAYWALL_EVENT, () => {
      setError(null);
      setOpen(true);
    });
    return () => sub.remove();
  }, []);

  const close = () => {
    setOpen(false);
    if (paymentRequiredItem) setDismissedItemId(paymentRequiredItem.id);
  };

  const subscribe = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await startSubscriptionCheckout(user?.email ?? undefined);
      // On web this navigates away; on native this resolves when the checkout
      // browser is dismissed — entitlements then flip via the webhook and the
      // sheet switches to its subscribed state.
    } catch (e: any) {
      if (e?.code === 'functions/already-exists') {
        // Server refused a second subscription and self-healed entitlements;
        // the snapshot flips `subscribed` momentarily. Nothing to show.
      } else {
        console.error('[paywall] checkout failed', e);
        setError(e?.message ?? 'could not start checkout — try again');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
      <View className="flex-1 bg-black/50 items-center justify-center px-6">
        <View className="w-full max-w-[400px] rounded-[var(--radius)] border border-border bg-card p-6 gap-4">
          {subscribed ? (
            <>
              <Text className="text-xl font-serif-medium text-foreground">you're in</Text>
              <Text className="text-[0.95rem] font-serif text-muted-foreground leading-relaxed">
                your subscription is active — {MONTHLY_STORY_LIMIT} stories a month, every length,
                every narrator, every voice.
                {hadBlockedItemRef.current ? ' your story is picking back up now.' : ''}
              </Text>
              <Button size="lg" className="w-full" onPress={close}>
                keep listening
              </Button>
            </>
          ) : (
            <>
              <Text className="text-xl font-serif-medium text-foreground">keep the stories coming</Text>
              <Text className="text-[0.95rem] font-serif text-muted-foreground leading-relaxed">
                you've used your {FREE_STORY_LIMIT} free stories. subscribe for {MONTHLY_PRICE_LABEL} and
                get {MONTHLY_STORY_LIMIT} stories every month — every length, every narrator, every voice.
              </Text>
              {error && <Text className="text-sm font-serif text-destructive">{error}</Text>}
              <Button size="lg" className="w-full" loading={busy} onPress={subscribe}>
                subscribe · {MONTHLY_PRICE_LABEL}
              </Button>
              <Pressable onPress={close} className="py-1 self-center">
                <Text className="text-sm font-serif text-muted-foreground">not now</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}
