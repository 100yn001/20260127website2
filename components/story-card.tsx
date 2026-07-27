import { LinearGradient } from 'expo-linear-gradient';
import { Moon, Sun } from 'lucide-react-native';
import * as React from 'react';
import { Pressable, Text, View } from 'react-native';
import { cn } from '@/lib/cn';

export type StoryCover = { a: string; b: string };

export type CardStory = {
  id: string;
  title: string;
  narrator?: string;
  durationMin: number;
  cover: StoryCover;
  nighttime: boolean;
  progressPct?: number;
  createdAgo?: string;
  isNew?: boolean;
  /** Curated public-library tags, ordered vibe → hook → audience. */
  tags?: string[];
};

/* -------------------------------------------------------------------------- */

export function StoryArtwork({
  cover,
  nighttime,
  size,
  showBadge = true,
  children,
  className,
}: {
  cover: StoryCover;
  nighttime: boolean;
  size?: number;
  showBadge?: boolean;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <View
      className={cn('overflow-hidden rounded-[14px]', className)}
      style={size ? { width: size, height: size } : { aspectRatio: 1, width: '100%' }}
    >
      <LinearGradient
        colors={[cover.a, cover.b]}
        start={{ x: 0.28, y: 0.22 }}
        end={{ x: 1, y: 1 }}
        style={{ flex: 1 }}
      />
      {showBadge && (
        <View className="absolute top-2 left-2 h-6 w-6 items-center justify-center rounded-full bg-black/30">
          {nighttime ? (
            <Moon size={12} color="rgba(255,255,255,0.9)" />
          ) : (
            <Sun size={12} color="rgba(255,255,255,0.9)" />
          )}
        </View>
      )}
      {children}
    </View>
  );
}

/* -------------------------------------------------------------------------- */

export function StoryCard({
  story,
  onPress,
  selected,
  selectMode,
}: {
  story: CardStory;
  onPress?: () => void;
  selected?: boolean;
  selectMode?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={cn(
        'rounded-[var(--radius)] p-1.5',
        selectMode && selected && 'bg-accent'
      )}
    >
      <View className="relative">
        <StoryArtwork cover={story.cover} nighttime={story.nighttime} />
        {selectMode && (
          <View
            className={cn(
              'absolute top-2 right-2 h-6 w-6 items-center justify-center rounded-full border',
              selected ? 'bg-primary border-primary' : 'bg-black/30 border-white/40'
            )}
          >
            {selected && <View className="h-2.5 w-2.5 rounded-full bg-primary-foreground" />}
          </View>
        )}
        {story.isNew && !selectMode && (
          <View className="absolute top-2 right-2 rounded-full bg-primary px-1.5 py-0.5">
            <Text className="text-[10px] font-serif-medium text-primary-foreground">new</Text>
          </View>
        )}
      </View>
      <View className="mt-2 px-1">
        <Text
          className="text-[0.95rem] font-serif-medium text-foreground leading-snug"
          numberOfLines={2}
        >
          {story.title}
        </Text>
        <Text className="mt-0.5 text-[11px] font-serif text-muted-foreground" numberOfLines={1}>
          {story.durationMin} min
          {story.createdAgo ? <>  ·  {story.createdAgo}</> : null}
          {story.narrator ? <>  ·  {story.narrator}</> : null}
        </Text>
      </View>
    </Pressable>
  );
}

/* -------------------------------------------------------------------------- */

export function ContinueCard({ story, onPress }: { story: CardStory; onPress?: () => void }) {
  const pct = story.progressPct ?? 0;
  const remaining = Math.max(0, Math.round(story.durationMin * (1 - pct / 100)));
  return (
    <Pressable onPress={onPress} className="w-[160px] md:w-[210px] lg:w-[230px] xl:w-[280px]">
      <View className="relative">
        <StoryArtwork cover={story.cover} nighttime={story.nighttime} />
        <View className="absolute left-2 right-2 bottom-2">
          <View className="h-1 overflow-hidden rounded-full bg-white/20">
            <View className="h-full bg-white/90" style={{ width: `${pct}%` }} />
          </View>
          <Text className="mt-1 text-[11px] font-serif text-white/85">
            <Text className="font-sans">{remaining}</Text> min left
          </Text>
        </View>
      </View>
      <View className="mt-2 px-0.5">
        <Text className="text-[0.9rem] font-serif-medium text-foreground" numberOfLines={1}>
          {story.title}
        </Text>
        {story.narrator ? (
          <Text className="mt-0.5 text-[11px] font-serif text-muted-foreground" numberOfLines={1}>
            {story.narrator}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

/* -------------------------------------------------------------------------- */

export function ShelfCard({ story, onPress }: { story: CardStory; onPress?: () => void }) {
  const vibeTag = story.tags?.[0];
  return (
    <Pressable onPress={onPress} className="w-[140px] md:w-[180px] lg:w-[200px] xl:w-[240px]">
      <StoryArtwork cover={story.cover} nighttime={story.nighttime}>
        {vibeTag ? (
          <View className="absolute bottom-2 left-2 rounded-full bg-black/30 px-2 py-0.5">
            <Text className="text-[10px] font-serif lowercase text-white/90">{vibeTag}</Text>
          </View>
        ) : null}
      </StoryArtwork>
      <View className="mt-2 px-0.5">
        <Text className="text-[0.9rem] font-serif-medium text-foreground" numberOfLines={1}>
          {story.title}
        </Text>
        <Text className="mt-0.5 text-[11px] font-serif text-muted-foreground" numberOfLines={1}>
          <Text className="font-sans">{story.durationMin}</Text> min
          {story.narrator ? <>  ·  {story.narrator}</> : null}
        </Text>
      </View>
    </Pressable>
  );
}
