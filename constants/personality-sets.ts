export type BinaryQuestion = { top: string; bottom: string };

// Surface set — shown in order
export const personalityInitial: BinaryQuestion[] = [
  { top: 'dinner date', bottom: 'coffee date' },
  { top: 'slow burn', bottom: 'instant spark' },
  { top: 'window seat', bottom: 'corner booth' },
  { top: 'ballroom dancing', bottom: 'kitchen dancing' },
  { top: 'hand in hand', bottom: 'arm around shoulder' },
  { top: 'first asleep', bottom: 'last awake' },
  { top: 'arrive together', bottom: 'meet there' },
  { top: 'dressed up', bottom: 'dressed down' },
  { top: 'first touch', bottom: 'first kiss' },
  { top: 'right now', bottom: 'forever' },
];

// Deep set — shuffled and sliced to 10 per session
export const personalityReally: BinaryQuestion[] = [
  { top: 'moon', bottom: 'sun' },
  { top: 'up', bottom: 'down' },
  { top: 'sea', bottom: 'stars' },
  { top: 'lung', bottom: 'heart' },
  { top: 'eclipse', bottom: 'solstice' },
  { top: 'snow', bottom: 'amber' },
  { top: 'vine', bottom: 'wire' },
  { top: 'tide', bottom: 'wind' },
  { top: 'predator', bottom: 'prey' },
  { top: 'linen', bottom: 'leather' },
  { top: 'moth', bottom: 'flame' },
  { top: 'inhale', bottom: 'exhale' },
  { top: 'compass', bottom: 'anchor' },
  { top: 'needle', bottom: 'thread' },
  { top: 'comet', bottom: 'nebula' },
  { top: 'chorus', bottom: 'solo' },
  { top: 'question', bottom: 'answer' },
];
