import { Sparkles, X } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { functions } from '@/config/firebase';
import { httpsCallable } from 'firebase/functions';

export interface AmbientSuggestionContext {
  setting?: string;
  location?: string;
  character?: string;
  trope?: string;
  prompt?: string;
}

// Server-side (suggestAmbient callable) — the Anthropic key no longer ships
// in the client.
async function suggestAmbientSounds(ctx: AmbientSuggestionContext): Promise<string[]> {
  const call = httpsCallable<AmbientSuggestionContext, { suggestions: string[] }>(
    functions,
    'suggestAmbient',
  );
  return (await call(ctx)).data.suggestions;
}
import { cn } from '@/lib/cn';

const MAX_SELECTIONS = 2;

interface Props {
  context: AmbientSuggestionContext;
  selected: string[];
  onChange: (next: string[]) => void;
  /** Trigger a fresh suggestion fetch. Bumping this re-fetches. */
  refreshKey?: string | number;
}

export default function AmbientPicker({ context, selected, onChange, refreshKey }: Props) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customDraft, setCustomDraft] = useState('');
  const lastSeedRef = useRef<string>('');

  // Custom prompts the user has added (and that aren't part of suggestions)
  const customSelected = selected.filter((s) => !suggestions.includes(s));

  const fetchSuggestions = async () => {
    const seed = JSON.stringify(context);
    if (seed === lastSeedRef.current && suggestions.length > 0) return;
    lastSeedRef.current = seed;

    setLoading(true);
    setError(null);
    try {
      const result = await suggestAmbientSounds(context);
      setSuggestions(result);
      if (result.length === 0) setError('no suggestions yet — describe your scene first');
    } catch (e: any) {
      console.error('[AmbientPicker] suggest failed', e);
      setError('couldn’t reach the suggester — type your own below');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchSuggestions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(context), refreshKey]);

  const toggle = (label: string) => {
    if (selected.includes(label)) {
      onChange(selected.filter((s) => s !== label));
      return;
    }
    if (selected.length >= MAX_SELECTIONS) {
      // Replace the oldest selection to keep the cap
      onChange([...selected.slice(1), label]);
      return;
    }
    onChange([...selected, label]);
  };

  const addCustom = () => {
    const v = customDraft.trim().toLowerCase();
    if (!v) return;
    if (selected.includes(v) || suggestions.includes(v)) {
      setCustomDraft('');
      return;
    }
    if (selected.length >= MAX_SELECTIONS) {
      onChange([...selected.slice(1), v]);
    } else {
      onChange([...selected, v]);
    }
    setCustomDraft('');
  };

  const removeCustom = (v: string) => onChange(selected.filter((s) => s !== v));

  return (
    <View className="gap-3">
      <View className="flex-row items-baseline justify-between">
        <Label>background sound</Label>
        <Text className="text-[11px] font-sans text-muted-foreground">
          pick up to {MAX_SELECTIONS}
        </Text>
      </View>

      {loading ? (
        <View className="flex-row items-center gap-2 py-2">
          <ActivityIndicator size="small" color="hsl(var(--muted-foreground))" />
          <Text className="text-xs font-serif text-muted-foreground">finding sounds for your scene…</Text>
        </View>
      ) : (
        <View className="flex-row flex-wrap gap-2">
          {suggestions.map((s) => {
            const active = selected.includes(s);
            return (
              <Pressable
                key={s}
                onPress={() => toggle(s)}
                className={cn(
                  'flex-row items-center gap-1.5 rounded-full border px-3 py-1.5',
                  active ? 'border-foreground bg-foreground' : 'border-border bg-card',
                )}
              >
                {active ? null : <Sparkles size={12} color="hsl(var(--muted-foreground))" />}
                <Text
                  className={cn(
                    'text-[12px] font-serif',
                    active ? 'text-background' : 'text-foreground',
                  )}
                >
                  {s}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {error ? (
        <Text className="text-[11px] font-serif text-muted-foreground">{error}</Text>
      ) : null}

      {customSelected.length > 0 && (
        <View className="flex-row flex-wrap gap-2">
          {customSelected.map((v) => (
            <Pressable
              key={v}
              onPress={() => removeCustom(v)}
              className="flex-row items-center gap-1.5 rounded-full border border-foreground bg-foreground px-3 py-1.5"
            >
              <Text className="text-[12px] font-serif text-background">{v}</Text>
              <X size={11} color="hsl(var(--background))" />
            </Pressable>
          ))}
        </View>
      )}

      <View className="flex-row items-center gap-2">
        <Input
          value={customDraft}
          onChangeText={setCustomDraft}
          placeholder="enter your own…"
          autoCapitalize="none"
          onSubmitEditing={addCustom}
          returnKeyType="done"
          className="flex-1"
        />
        <Pressable
          onPress={addCustom}
          disabled={!customDraft.trim()}
          className={cn(
            'rounded-full px-4 py-2 border',
            customDraft.trim() ? 'border-foreground bg-foreground' : 'border-border bg-card opacity-60',
          )}
        >
          <Text
            className={cn(
              'text-[12px] font-serif-medium',
              customDraft.trim() ? 'text-background' : 'text-muted-foreground',
            )}
          >
            add
          </Text>
        </Pressable>
      </View>

      {selected.length === 0 ? (
        <Text className="text-[11px] font-serif text-muted-foreground">
          leave empty for narration only.
        </Text>
      ) : null}
    </View>
  );
}
