// Batch-1 public-story specs — the machine-readable slate from CATALOG.md.
// Pure data + validation; no side effects. Consumed by generate.mjs.
//
// Spec contract:
//   slug            unique key: manifest entry, out/<slug>.txt, storage filenames
//   title           shelf-card title (lowercase, Quinn/Dipsea-coded)
//   collection      exact shelf string the library groups by
//   genre           loose genre label stored on the doc
//   isNighttime     drives toneLine, storage folder, libraryCategory, badge
//   duration        '5min' | '10min' | '15min'
//   narrationMode   'immersive' | 'intermediate' | 'cinematic'
//   voiceId         ElevenLabs voice — one-shots only (paired stories resolve the
//                   live narrator doc's voiceId at publish time)
//   narratorKey     publicNarrators usernameLowercase — paired stories only
//   narratorName    byline written verbatim to the doc
//   genderSelf      listener gender ('female' | 'male')
//   genderOther     speaker gender ('female' | 'male')
//   character/setting/location/trope/prompt   scene-notes recipe fields
//   features/featurePreferences               nighttime escalation hints
//   tags            2-3 curated tags, ordered vibe → hook → audience-exception

// POV tags are the community-standard [speaker]4[listener] codes. Every story
// carries exactly one, in last position; validateSpecs derives the expected
// code from genderOther/genderSelf.
export const POV_TAGS = new Set(['m4f', 'f4m', 'm4m', 'f4f']);

export const TAG_VOCAB = new Set([
  // vibe
  'sleep', 'cozy', 'sweet', 'slow burn', 'spicy', 'dark', 'praise', 'soft dom', 'dom', 'possessive',
  // archetype
  'boyfriend', 'girlfriend', 'cowboy', 'ceo', 'bodyguard', 'fae', 'vampire', 'werewolf', 'orc', 'knight',
  // trope
  'enemies to lovers', 'one bed', 'forced proximity', 'fated mates', 'second chance', 'strangers to lovers',
  // pov (always last)
  ...POV_TAGS,
]);

// One hue per shelf, all in the same dark tonal band (~S 30-36%, L 27-28%),
// hues spaced ~40° so shelves are distinct but cohesive. Two close tones per
// shelf alternate across cards so a shelf reads as a set without being flat.
export const COLLECTION_COLORS = {
  bedtime: ['#313E5E', '#2A3652'],        // indigo
  'after dark': ['#5D325D', '#4F2A4F'],   // magenta-plum
  'dark romance': ['#5E2C39', '#4F2430'], // oxblood
  romantasy: ['#3E315E', '#362A52'],      // violet
};

export function colorForSpec(spec, indexInCollection) {
  if (spec.coverColor) return spec.coverColor;
  const palette = COLLECTION_COLORS[spec.collection] || ['#7F1D1D'];
  return palette[indexInCollection % palette.length];
}

// New narrator docs to seed (shape mirrors scripts/add-roman.js; Timestamp
// fields are added at write time). Existing narrators (grayson, beau, roman,
// mara, julia) are resolved from the live publicNarrators collection.
export const NEW_NARRATORS = [
  {
    name: 'Kael',
    gender: 'male',
    description: 'silver-white hair, moonlit eyes, unhurried ancient calm',
    relationship: 'your fae prince',
    additionalDetails:
      `he speaks the old way — bargains kept to the letter, debts remembered for centuries, and a court that goes quiet when he stands. but he stole you from the revel because the music bored him and you did not. his cloak is warmer than it has any right to be, and he has started calling the hour before dawn "your hour."`,
    userNameWithNarrator: 'wild thing',
    userGenderWithNarrator: 'other',
    voiceId: 'adZJnAl6IYZw4EYI9FVd', // British, deep/mysterious (catalog voice)
    username: 'kael',
    usernameLowercase: 'kael',
    isPublished: true,
    color: '#4C5578',
  },
];

export const SPECS = [
  // ── narrator pairs ────────────────────────────────────────────────────────
  {
    slug: 'grayson-rain-wind-down',
    title: 'asleep on your chest',
    collection: 'bedtime',
    genre: 'sleep',
    isNighttime: false,
    duration: '15min',
    narrationMode: 'immersive',
    narratorKey: 'grayson',
    narratorName: 'grayson',
    genderSelf: 'female',
    genderOther: 'male',
    character: 'Grayson — your boyfriend; broad shoulders, easy smile, half-asleep voice',
    setting: 'a rainy night in, already tangled together, the day finally over',
    location: 'his bed, rain starting against the window, one lamp left on',
    trope: 'established relationship; safe, sleepy, nowhere to be',
    prompt:
      'he keeps his voice low and drowsy, talks her down from a long day in pieces — nothing important, everything soft; his breath slows as hers does; ends nearly whispering into her hair as the rain settles in',
    features: [],
    featurePreferences: {},
    tags: ['sleep', 'boyfriend', 'm4f'],
  },
  {
    slug: 'grayson-lazy-sunday',
    title: 'lazy sunday',
    collection: 'after dark',
    genre: 'romance',
    isNighttime: true,
    duration: '10min',
    narrationMode: 'immersive',
    narratorKey: 'grayson',
    narratorName: 'grayson',
    genderSelf: 'female',
    genderOther: 'male',
    character: 'Grayson — your boyfriend; broad shoulders, dimpled smile, morning voice',
    setting: 'a slow sunday morning, waking up wrapped around each other with nowhere to be',
    location: 'his bed, late-morning light through the blinds',
    trope: 'established relationship; unhurried morning intimacy',
    features: ['slow morning sex', 'praise'],
    featurePreferences: { 'slow morning sex': ['receive'], praise: ['receive'] },
    prompt:
      'gentle and praise-heavy the whole way through — laughing-soft, zero rush, explicit but tender; warm landing: pulled back against his chest, blanket up, "five more minutes" that both know means an hour',
    tags: ['praise', 'boyfriend', 'm4f'],
  },
  {
    slug: 'roman-he-handles-it',
    title: 'he handles it',
    collection: 'bedtime',
    genre: 'sleep',
    isNighttime: false,
    duration: '10min',
    narrationMode: 'immersive',
    narratorKey: 'roman',
    narratorName: 'roman',
    genderSelf: 'female',
    genderOther: 'male',
    character: 'Roman — your older, steel-edged CEO; grey eyes, charcoal suit, sleeves rolled',
    setting: 'the end of the worst week of her life; he took one look at her and took over',
    location: 'his penthouse — bath already run, dinner ordered, her phone confiscated',
    trope: 'caretaking without being asked; quiet devotion',
    prompt:
      'controlled, low, certain; he handles every logistic so she can finally fall apart safely; nothing sexual — decompression and gentle command ("sit. eat. breathe."); ends with her wrapped in his suit jacket, half asleep, his hand steady on her back',
    features: [],
    featurePreferences: {},
    tags: ['cozy', 'ceo', 'm4f'],
  },
  {
    slug: 'roman-silk-tie',
    title: 'the silk tie',
    collection: 'dark romance',
    genre: 'dark romance',
    isNighttime: true,
    duration: '10min',
    narrationMode: 'immersive',
    narratorKey: 'roman',
    narratorName: 'roman',
    genderSelf: 'female',
    genderOther: 'male',
    character: 'Roman — your older, steel-edged CEO; grey eyes, heavy watch, the calm of a man who never asks twice',
    setting: 'after the gala; the silk tie he wore all night is in his pocket, and they both know why',
    location: 'the penthouse bedroom, city lights far below',
    trope: 'dominant and devoted; consensual power exchange',
    features: ['light restraint with the silk tie', 'praise', 'fingering'],
    featurePreferences: {
      'light restraint with the silk tie': ['receive'],
      praise: ['receive'],
      fingering: ['receive'],
    },
    prompt:
      'he asks first and she says yes, delighted — consent explicit and wanted on both sides; commanding but reverent, praise woven through the control; warm landing: he unties her wrists, kisses them both, tucks her against his chest',
    tags: ['dom', 'ceo', 'm4f'],
  },
  {
    slug: 'beau-porch-storm',
    title: 'porch light',
    collection: 'bedtime',
    genre: 'sleep',
    isNighttime: false,
    duration: '10min',
    narrationMode: 'immersive',
    narratorKey: 'beau',
    narratorName: 'beau',
    genderSelf: 'female',
    genderOther: 'male',
    character: 'Beau — your boyfriend; rancher, weathered hands, slow southern drawl',
    setting: 'the end of a long day on the ranch, a storm rolling in slow over the fields',
    location: 'the porch swing, one blanket over you both, crickets going quiet before the rain',
    trope: 'quiet love; no need to fill the silences',
    prompt:
      'his drawl gets slower as the storm gets closer; front-porch small talk — the horses, the fence line, nothing at all — melting into sleepiness; ends with the first rain on the roof and her nearly asleep on his shoulder',
    features: [],
    featurePreferences: {},
    tags: ['sleep', 'cowboy', 'm4f'],
  },
  {
    slug: 'beau-barn-heat',
    title: 'heat lightning',
    collection: 'after dark',
    genre: 'romance',
    isNighttime: true,
    duration: '10min',
    narrationMode: 'immersive',
    narratorKey: 'beau',
    narratorName: 'beau',
    genderSelf: 'female',
    genderOther: 'male',
    character: 'Beau — weathered, sure-handed, a drawl that drops half an octave when it is just you',
    setting: 'a summer storm breaks while you two are shutting up the barn; no point running for the house now',
    location: 'the barn, rain hammering the tin roof, one lantern lit',
    trope: 'slow burn finally breaking; months of long looks that finally land',
    features: ['slow undressing', 'sex'],
    featurePreferences: { 'slow undressing': ['receive'], sex: ['receive'] },
    prompt:
      'unhurried, drawling, certain; the tension of a whole season finally said out loud and acted on; explicit but tender; warm landing: his flannel around her shoulders, the two of them listening to the rain pass',
    tags: ['slow burn', 'cowboy', 'm4f'],
  },
  {
    slug: 'mara-last-call',
    title: 'last call',
    collection: 'bedtime',
    genre: 'sleep',
    isNighttime: false,
    duration: '10min',
    narrationMode: 'immersive',
    narratorKey: 'mara',
    narratorName: 'mara',
    genderSelf: 'female',
    genderOther: 'female',
    character: 'Mara — the tavern barmaid; short and curvy, long orange curls, knows every story in town',
    setting: 'the tavern after close; chairs up, fire down to embers, one last cup of something warm',
    location: 'the tavern hearth, candlelight, rain in the street outside',
    trope: 'cozy fantasy hospitality; being looked after',
    prompt:
      'she polishes the last glasses and talks low — the town, the road, the weather coming over the passes; keeps refilling your cup without being asked; ends banking the fire and draping her shawl over you where you have dozed off in the chair',
    features: [],
    featurePreferences: {},
    tags: ['sleep', 'cozy', 'f4f'],
  },
  {
    slug: 'mara-locks-the-door',
    title: 'after she locks the door',
    collection: 'after dark',
    genre: 'romance',
    isNighttime: true,
    duration: '10min',
    narrationMode: 'immersive',
    narratorKey: 'mara',
    narratorName: 'mara',
    genderSelf: 'female',
    genderOther: 'female',
    character: 'Mara — orange curls loose now, apron off, the practiced ease gone soft and nervous',
    setting: 'she flips the sign, bolts the door, and it is just you two and the firelight',
    location: 'the empty tavern, door locked, rain on the windows',
    trope: 'months of lingering looks over the bar, finally admitted',
    features: ['confession', 'slow kissing', 'fingering'],
    featurePreferences: { confession: ['receive'], 'slow kissing': ['receive'], fingering: ['receive'] },
    prompt:
      'soft, warm, a little teasing; the confession lands first and everything after is eager and explicitly wanted; explicit; warm landing: wrapped together in front of the fire under her shawl, her laugh low against your hair',
    tags: ['spicy', 'f4f'],
  },
  {
    slug: 'kael-starlit-court',
    title: 'the starlit court',
    collection: 'romantasy',
    genre: 'romantasy',
    isNighttime: false,
    duration: '10min',
    narrationMode: 'cinematic',
    narratorKey: 'kael',
    narratorName: 'kael',
    genderSelf: 'female',
    genderOther: 'male',
    character: 'Kael — a fae prince; silver-white hair, moonlit eyes, unhurried ancient calm',
    setting: 'he has stolen you away from the revel to the quiet of the night garden',
    location: 'the fae court gardens at midnight — starlight, night-blooming flowers, music far away',
    trope: 'protective courtly devotion; wonder without danger',
    prompt:
      'rich and lyrical but always speaking TO her, never narrating at her; he names constellations wrong on purpose to make her argue, trades one small true thing for another, keeps her wrapped in his cloak; ends with his promise to stand watch over her sleep — "nothing crosses this garden but the dawn"',
    features: [],
    featurePreferences: {},
    tags: ['cozy', 'fae', 'm4f'],
  },
  {
    slug: 'kael-the-bargain',
    title: 'the bargain',
    collection: 'romantasy',
    genre: 'romantasy',
    isNighttime: true,
    duration: '10min',
    narrationMode: 'cinematic',
    narratorKey: 'kael',
    narratorName: 'kael',
    genderSelf: 'female',
    genderOther: 'male',
    character: 'Kael — the fae prince; silver-white hair, rings cold against warm skin, a voice like a signed treaty',
    setting: 'a bargain sealed in the old way — terms stated plainly, freely offered, freely taken',
    location: "the prince's chambers; candlelight, velvet, the court's music very far away",
    trope: 'fae bargain; reverent power exchange, fully consensual',
    features: ['body worship', 'oral', 'sex'],
    featurePreferences: { 'body worship': ['receive'], oral: ['receive'], sex: ['receive'] },
    prompt:
      'he states the terms out loud and she agrees with delight — enthusiastic consent woven into the ritual of it; opulent, reverent, explicit; fae speech patterns (exact words, kept promises); warm landing: wrapped in furs, his heartbeat slow under her ear, "the bargain is kept"',
    tags: ['spicy', 'fae', 'm4f'],
  },
  {
    slug: 'julia-stay-on-the-line',
    title: 'stay on the line',
    collection: 'bedtime',
    genre: 'sleep',
    isNighttime: false,
    duration: '15min',
    narrationMode: 'immersive',
    narratorKey: 'julia',
    narratorName: 'julia',
    genderSelf: 'male',
    genderOther: 'female',
    character: 'Julia — your girlfriend; messy bun, wearing your hoodie, warm sleepy voice',
    setting: 'a late-night phone call because you could not sleep; she refuses to hang up',
    location: 'her bed on the other end of the line, lamp turned low',
    trope: 'girlfriend experience; long-distance comfort',
    prompt:
      'phone-call intimacy — she narrates small nothings, yawns mid-sentence, talks him down from the day; her voice gets heavier and warmer as it goes; ends with "stay on the line, i\'m right here" spoken into near-sleep',
    features: [],
    featurePreferences: {},
    tags: ['sleep', 'girlfriend', 'f4m'],
  },
  {
    slug: 'julia-good-boy',
    title: 'good boy',
    collection: 'after dark',
    genre: 'romance',
    isNighttime: true,
    duration: '10min',
    narrationMode: 'immersive',
    narratorKey: 'julia',
    narratorName: 'julia',
    genderSelf: 'male',
    genderOther: 'female',
    character: 'Julia — your girlfriend; warm brown eyes, wicked-soft smile, your hoodie finally coming off',
    setting: 'she pushes you back onto the bed with one hand and that look',
    location: 'her bedroom, lamp low',
    trope: 'soft fdom girlfriend; praise-heavy control',
    features: ['praise', 'teasing', 'riding'],
    featurePreferences: { praise: ['receive'], teasing: ['receive'], riding: ['give'] },
    prompt:
      'affectionate dominance — never mean, all praise; "good boy" as pure devotion; playful control, explicit; warm landing: she pulls him onto her chest, fingers in his hair, "you did so well"',
    tags: ['soft dom', 'praise', 'f4m'],
  },

  // ── one-shots ─────────────────────────────────────────────────────────────
  {
    slug: 'lighthouse-keeper',
    title: 'the night watch',
    collection: 'bedtime',
    genre: 'sleep',
    isNighttime: false,
    duration: '15min',
    narrationMode: 'cinematic',
    voiceId: 'HZTk7bUIkiI7yT7FKH4h', // Australian male, deep/soothing
    narratorName: null,
    genderSelf: 'female',
    genderOther: 'male',
    character: 'the lighthouse keeper — weathered, kind, half-smiling; a voice that has outlasted storms',
    setting: 'the storm drove your boat in at dusk; he keeps the light, and tonight he keeps you company',
    location: 'the lamp room of a lighthouse, rain on the glass, kettle on the ring, the beam turning slow',
    trope: "a stranger's shelter that feels like being courted slowly",
    prompt:
      'he narrates the night watch — the beam turning, the ships out there in the dark, tea poured and pressed into your hands; rhythmic and unhurried, warm without hurry; ends with the storm easing and her asleep in the watch chair under his coat',
    features: [],
    featurePreferences: {},
    tags: ['sleep', 'm4f'],
  },
  {
    slug: 'night-train-home',
    title: 'last train home',
    collection: 'bedtime',
    genre: 'sleep',
    isNighttime: false,
    duration: '10min',
    narrationMode: 'immersive',
    voiceId: 'iIg0uI51lssRFauz7W21', // Australian male, young/calm
    narratorName: null,
    genderSelf: 'female',
    genderOther: 'male',
    character: 'a kind stranger on the last train — soft-spoken, young, a warm unguarded laugh',
    setting: 'the last train home after a long day; the carriage nearly empty, the city sliding past',
    location: 'a night train, lights strobing slow past the window, the hum of the rails',
    trope: 'strangers to lovers, first spark; clean',
    prompt:
      'shy-warm conversation that gets quieter as the carriage empties; a shoulder gradually leaned on, permission asked with a look; ends with "this is my stop… but i\'ll wait for yours"',
    features: [],
    featurePreferences: {},
    tags: ['sweet', 'strangers to lovers', 'm4f'],
  },
  {
    slug: 'rain-on-the-skylight',
    title: 'rain on the skylight',
    collection: 'bedtime',
    genre: 'sleep',
    isNighttime: false,
    duration: '15min',
    narrationMode: 'immersive',
    voiceId: 'mgpcWiEXIWuENJCy8ADX', // American female, gentle/warm
    narratorName: null,
    genderSelf: 'female',
    genderOther: 'female',
    character: 'your partner — gentle-voiced, warm-handed, endlessly patient',
    setting: 'a do-nothing rainy evening; tonight you are being put to bed properly',
    location: 'an attic bedroom under a skylight, rain above, fairy lights going off one by one',
    trope: 'personal attention; being tucked in',
    prompt:
      'unhurried personal attention — hair brushed back, the weight of the blanket named, breath paced out loud ("in… and out"); her voice fades toward a whisper as the rain keeps on; ends in near-silence',
    features: [],
    featurePreferences: {},
    tags: ['sleep', 'cozy', 'f4f'],
  },
  {
    slug: 'orc-by-the-hearth',
    title: 'by the hearth',
    collection: 'romantasy',
    genre: 'romantasy',
    isNighttime: false,
    duration: '10min',
    narrationMode: 'cinematic',
    voiceId: 'B5jEZPqk2OJ2vkPw3wBM', // Irish male, deep/laid-back
    narratorName: null,
    genderSelf: 'female',
    genderOther: 'male',
    character: 'Dhurak — an orc, huge and gentle; tusks, careful hands, a low rumbling voice',
    setting: 'he found you half-frozen on the mountain road; now you are his guest, and he is quietly beside himself about it',
    location: 'a lamplit stone cottage, stew on the fire, snow ticking at the shutters',
    trope: 'cozy monster romance; gentle giant',
    prompt:
      'rumbling, deliberate, shy-sweet; he mends your traveling cloak with enormous careful hands and apologizes for the size of everything — the cups, the chairs, himself; ends with the best stew of your life and a bed made up warm by the fire',
    features: [],
    featurePreferences: {},
    tags: ['cozy', 'orc', 'm4f'],
  },
  {
    slug: 'snowed-in-chalet',
    title: 'snowed in',
    collection: 'bedtime',
    genre: 'sleep',
    isNighttime: false,
    duration: '10min',
    narrationMode: 'immersive',
    voiceId: 'Qe9WSybioZxssVEwlBSo', // British male, smooth/calming
    narratorName: null,
    genderSelf: 'female',
    genderOther: 'male',
    character: 'your best friend — the one you have never quite dared to name what this is',
    setting: 'the blizzard closed the pass; one chalet, one fireplace, his sweater already on you',
    location: 'a wooden chalet, snow burying the windows, firelight and cocoa',
    trope: 'forced proximity; friends on the edge of more; clean',
    prompt:
      'one blanket, two mugs, honesty arriving slowly; hands close, then closer; stays fully SFW — the confession lands soft and the storm hums on; ends foreheads together, warm, snowfall silent outside',
    features: [],
    featurePreferences: {},
    tags: ['sweet', 'forced proximity', 'm4f'],
  },
  {
    slug: 'rivals-one-bed',
    title: 'one bed',
    collection: 'dark romance',
    genre: 'dark romance',
    isNighttime: true,
    duration: '10min',
    narrationMode: 'immersive',
    voiceId: 'qAZH0aMXY8tw1QufPN0D', // American male, calm/authoritative
    narratorName: null,
    genderSelf: 'female',
    genderOther: 'male',
    character: 'your rival — sharp-tongued, infuriating, devastatingly aware of you',
    setting: 'the conference hotel lost your booking; one room left, one bed, and neither of you will admit to minding',
    location: 'a hotel room, one bed, neon bleeding through the blinds',
    trope: 'enemies to lovers; only one bed',
    features: ['dirty talk that turns from barbed to praising', 'fingering', 'sex'],
    featurePreferences: {
      'dirty talk that turns from barbed to praising': ['receive'],
      fingering: ['receive'],
      sex: ['receive'],
    },
    prompt:
      'the bickering keeps its edge but turns molten; consent loud, mutual, and a little laughing; explicit and hungry; warm landing: a truce declared into her hair at 2am — "this changes everything. good."',
    tags: ['enemies to lovers', 'spicy', 'm4f'],
  },
  {
    slug: 'the-bodyguard',
    title: 'close protection',
    collection: 'dark romance',
    genre: 'dark romance',
    isNighttime: true,
    duration: '10min',
    narrationMode: 'immersive',
    voiceId: '2gPFXx8pN3Avh27Dw5Ma', // American male, deep/commanding
    narratorName: null,
    genderSelf: 'female',
    genderOther: 'male',
    character: 'your bodyguard — six years at your shoulder, professional to the bone, until tonight',
    setting: 'the threat at the gala was real; adrenaline is still up; the safehouse door is finally locked',
    location: 'a safehouse bedroom, city glow through armored glass',
    trope: 'bodyguard romance; protective restraint finally breaking',
    features: ['pinned gently against the door', 'praise', 'sex'],
    featurePreferences: {
      'pinned gently against the door': ['receive'],
      praise: ['receive'],
      sex: ['receive'],
    },
    prompt:
      'protocol-voice cracking into want; he asks permission with his forehead against hers and waits for the yes; possessive but reverent, explicit; warm landing: perimeter checked one last time, her tucked under his arm — "sleep. i have the watch."',
    tags: ['possessive', 'bodyguard', 'm4f'],
  },
  {
    slug: 'crimson-hours',
    title: 'crimson hours',
    collection: 'dark romance',
    genre: 'dark romance',
    isNighttime: true,
    duration: '10min',
    narrationMode: 'immersive',
    voiceId: 'Qe9WSybioZxssVEwlBSo', // British male, smooth/calming
    narratorName: null,
    genderSelf: 'female',
    genderOther: 'male',
    character: 'a centuries-old vampire — elegant, patient, devastatingly restrained',
    setting: 'the third night you have come to his door; tonight he stops pretending he does not count the hours between',
    location: 'a candlelit study in an old house — velvet, dark wood, a fire that never quite dies',
    trope: 'vampire romance; restraint and reverence; one taste',
    features: ['neck kissing and a consensual bite', 'body worship', 'sex'],
    featurePreferences: {
      'neck kissing and a consensual bite': ['receive'],
      'body worship': ['receive'],
      sex: ['receive'],
    },
    prompt:
      'he asks three times before the bite — consent as ritual, her yes savored each time; slow, reverent, explicit; the hunger is for HER, the blood is incidental; warm landing: her heartbeat counted out loud, dawn held at the door, her wrapped in his coat',
    tags: ['dark', 'vampire', 'm4f'],
  },
  {
    slug: 'wolf-and-mate',
    title: 'the solstice fire',
    collection: 'romantasy',
    genre: 'romantasy',
    isNighttime: true,
    duration: '10min',
    narrationMode: 'immersive',
    voiceId: 'HZTk7bUIkiI7yT7FKH4h', // Australian male, deep/soothing
    narratorName: null,
    genderSelf: 'female',
    genderOther: 'male',
    character: 'a werewolf — broad, warm-blooded, half-feral gentleness; firelight caught in his eyes',
    setting: 'the solstice fire; the moment he scents you the whole clearing goes quiet',
    location: 'the edge of the firelight, forest dark behind, the drums fading out',
    trope: 'fated mates; recognition and claiming, freely chosen',
    features: ['scenting and slow claiming', 'praise', 'sex'],
    featurePreferences: {
      'scenting and slow claiming': ['receive'],
      praise: ['receive'],
      sex: ['receive'],
    },
    prompt:
      'the bond is instant but he asks in words — "say it back, or i walk away" — and she says it; possessive-tender, explicit; warm landing: wrapped in his fur-lined cloak, his heartbeat slow like a drum under her ear',
    tags: ['fated mates', 'werewolf', 'm4f'],
  },
  {
    slug: 'the-obsession',
    title: 'devoted',
    collection: 'dark romance',
    genre: 'dark romance',
    isNighttime: true,
    duration: '10min',
    narrationMode: 'immersive',
    voiceId: 'qAZH0aMXY8tw1QufPN0D', // American male, calm/authoritative
    narratorName: null,
    genderSelf: 'female',
    genderOther: 'male',
    character: 'the one who has loved you from across every room for years — composed, intense, finally at your door',
    setting: 'tonight he says all of it: every remembered detail, every kept memory, and then he waits',
    location: 'your doorway, then your living room; rain outside, one lamp',
    trope: 'devotion at full intensity; consent held sacred',
    features: ['confession', 'worshipful touch', 'sex'],
    featurePreferences: {
      confession: ['receive'],
      'worshipful touch': ['receive'],
      sex: ['receive'],
    },
    prompt:
      'intense but never coercive — he offers everything and then waits, and she chooses him clearly and out loud; devotion vocabulary ("i remember everything you have ever told me"); explicit; warm landing: her name repeated like a vow, the blanket drawn up over them both',
    tags: ['dark', 'possessive', 'm4f'],
  },
  {
    slug: 'ember-knight',
    title: 'sworn to him',
    collection: 'romantasy',
    genre: 'romantasy',
    isNighttime: true,
    duration: '10min',
    narrationMode: 'cinematic',
    voiceId: '2gPFXx8pN3Avh27Dw5Ma', // American male, deep/commanding
    narratorName: null,
    genderSelf: 'male',
    genderOther: 'male',
    character: 'Ser Aldric — the knight sworn to you since you were both boys; scarred hands, careful eyes',
    setting: 'the night before the border campaign; he comes to your chambers to say what a decade of guarding never let him say',
    location: "the prince's chambers, banked fire, his armor on the stand in the corner",
    trope: 'knight and prince; forbidden loyalty; slow burn breaking',
    features: ['confession', 'slow undressing', 'sex'],
    featurePreferences: {
      confession: ['receive'],
      'slow undressing': ['receive'],
      sex: ['receive'],
    },
    prompt:
      'oath-language turned intimate — "my prince" becoming just his name; explicit, tender, with the gravity of a first time long imagined; warm landing: his cloak over them both, the watch kept until sleep',
    tags: ['slow burn', 'knight', 'm4m'],
  },
  {
    slug: 'midnight-encore',
    title: 'midnight encore',
    collection: 'after dark',
    genre: 'romance',
    isNighttime: true,
    duration: '10min',
    narrationMode: 'immersive',
    voiceId: 'Qe9WSybioZxssVEwlBSo', // British male, smooth/calming
    narratorName: null,
    genderSelf: 'female',
    genderOther: 'male',
    character: 'your ex — the one that never quite ended; rain-wet at your door at midnight',
    setting: 'one rainy night, one last conversation that becomes everything unsaid',
    location: 'your apartment, rain on the windows, one lamp on',
    trope: 'second chance; everything unsaid finally said',
    features: ['slow rediscovery', 'praise', 'sex'],
    featurePreferences: {
      'slow rediscovery': ['receive'],
      praise: ['receive'],
      sex: ['receive'],
    },
    prompt:
      'familiar-hands intimacy — knowing exactly how, and asking anyway; explicit, aching, warm; landing: "stay this time" answered by him staying, keys set down on the counter like a promise',
    tags: ['second chance', 'spicy', 'm4f'],
  },
];

const VALID_DURATIONS = new Set(['5min', '10min', '15min']);
const VALID_MODES = new Set(['immersive', 'intermediate', 'cinematic']);
const VALID_GENDERS = new Set(['female', 'male']);
const VALID_COLLECTIONS = new Set(Object.keys(COLLECTION_COLORS));

export function validateSpecs() {
  const errors = [];
  const slugs = new Set();
  for (const spec of SPECS) {
    const at = (msg) => errors.push(`[${spec.slug || '<no slug>'}] ${msg}`);
    if (!spec.slug || !/^[a-z0-9-]+$/.test(spec.slug)) at('slug missing or not kebab-case');
    if (slugs.has(spec.slug)) at('duplicate slug');
    slugs.add(spec.slug);
    if (!spec.title || spec.title !== spec.title.toLowerCase()) at('title missing or not lowercase');
    if (!VALID_COLLECTIONS.has(spec.collection)) at(`unknown collection "${spec.collection}"`);
    if (typeof spec.isNighttime !== 'boolean') at('isNighttime must be boolean');
    if (!VALID_DURATIONS.has(spec.duration)) at(`bad duration "${spec.duration}"`);
    if (!VALID_MODES.has(spec.narrationMode)) at(`bad narrationMode "${spec.narrationMode}"`);
    if (!VALID_GENDERS.has(spec.genderSelf)) at(`bad genderSelf "${spec.genderSelf}"`);
    if (!VALID_GENDERS.has(spec.genderOther)) at(`bad genderOther "${spec.genderOther}"`);
    if (!spec.character || !spec.setting || !spec.location || !spec.trope) {
      at('character/setting/location/trope are all required');
    }
    const hasVoice = typeof spec.voiceId === 'string' && spec.voiceId.length > 0;
    const hasNarrator = typeof spec.narratorKey === 'string' && spec.narratorKey.length > 0;
    if (hasVoice === hasNarrator) at('exactly one of voiceId (one-shot) or narratorKey (paired) required');
    if (hasNarrator && !spec.narratorName) at('narratorKey requires narratorName');
    if (!spec.isNighttime && (spec.features || []).length > 0) at('daytime story must not have features');
    if (spec.isNighttime && (spec.features || []).length === 0) at('nighttime story needs features');
    for (const f of spec.features || []) {
      const prefs = (spec.featurePreferences || {})[f];
      if (!Array.isArray(prefs) || prefs.length === 0) at(`feature "${f}" missing featurePreferences`);
    }
    if (!Array.isArray(spec.tags) || spec.tags.length < 2 || spec.tags.length > 3) {
      at('tags must have 2-3 entries (vibe first, pov code last)');
    } else {
      for (const t of spec.tags) if (!TAG_VOCAB.has(t)) at(`tag "${t}" not in TAG_VOCAB`);
      const expectedPov = `${(spec.genderOther || 'x')[0]}4${(spec.genderSelf || 'x')[0]}`;
      const last = spec.tags[spec.tags.length - 1];
      if (last !== expectedPov) at(`last tag must be pov code "${expectedPov}", got "${last}"`);
      for (const t of spec.tags.slice(0, -1)) if (POV_TAGS.has(t)) at(`pov tag "${t}" only allowed in last position`);
    }
  }
  const narratorKeys = new Set(SPECS.filter((s) => s.narratorKey).map((s) => s.narratorKey));
  for (const n of NEW_NARRATORS) {
    if (!n.usernameLowercase) errors.push(`[narrator ${n.name}] missing usernameLowercase`);
    if (!n.voiceId) errors.push(`[narrator ${n.name}] missing voiceId`);
  }
  if (errors.length) {
    throw new Error(`spec validation failed:\n  ${errors.join('\n  ')}`);
  }
  return { count: SPECS.length, narratorKeys: [...narratorKeys] };
}
