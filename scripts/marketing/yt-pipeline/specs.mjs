// YouTube hero-test specs — 4 launch videos (2 M4F POV + 1 bedtime + 1 F4M gf),
// premises picked from live YouTube search mining (see PLAYBOOK.md):
//   - quote-style titles dominate the POV lanes (BoyfriendAudio formula)
//   - soft-jealous ("pretends he's not jealous") and wholesome-devoted yandere
//     outperform toxic variants — and fit the platform ceiling
//   - sleep lane: "you can't sleep and he notices" family (963k views) has
//     weak recent supply; winners run 30min+, rain-mixed, black-screen-coded
//   - gf lane: comfort/reassurance is the queen category (400-600k audios);
//     domestic "waited up / coming home" + praise is the trending flavor
//
// Consumed by generate.mjs. Pure data.

// Roster voices (match the app's house sound — see public-stories RENDER_TUNING):
// dusk = the YouTube "boyfriend" continuity voice (also the-bodyguard's app voice);
// veil = the YouTube girlfriend — same voice as the app narrator julia.
export const VOICE_ID = 'xWPPOvvQW78MpD6evTo9'; // dusk (whisper)
export const GF_VOICE_ID = 'On3mNeKJI0XxvSyM3sLT'; // veil (whisper)

// Per-genre craft profiles — beats/pacing/performance differ by genre.
export const GENRE_PROFILES = {
  jealous: {
    tone: `- Emotionally intense but YouTube-safe: tension, closeness, kissing, holding — nothing explicit, no sexual acts. Suggestive warmth at most.`,
    arc: `THE ARC (three beats, felt not labeled): (1) cold open mid-tension — he's pretending he isn't jealous and doing a bad job of it, clipped answers, deflection; (2) the crack — she calls it, he starts denying and the denial falls apart mid-sentence; (3) repair — he owns it, quiet and close, makeup warmth, ends settled with one thread left warm.`,
    performance: `PERFORMANCE: raised-then-broken. Start with edges — short clipped lines, false starts, sentences he abandons. When he cracks, everything slows and drops close to the mic. Real pauses (…), a breath before the hard admissions. Never theatrical anger; it's jealousy worn by someone embarrassed to have it.`,
    open: `COLD OPEN: first line lands mid-scene, mid-mood — no greeting, no setup. Something like denying it before she's even finished asking. Never "hey" or scene-setting.`,
  },
  devoted: {
    tone: `- Soft-possessive and devoted, consent-framed and YouTube-safe: she is safe, adored, and free — the intensity is in his certainty, not in threat. No coercion, no explicit content. She's smiling; he'd let her go, and they both know she won't.`,
    arc: `THE ARC (three beats, felt not labeled): (1) cold open on calm surface — an ordinary domestic moment where his attention is total; (2) the reveal-by-degrees — small confessions of just how much he notices, remembers, keeps; devotion tipping past casual into consuming, said with a soft smile; (3) reframed landing — the intensity resolves as safety: being watched this closely IS being loved, ends still and certain.`,
    performance: `PERFORMANCE: soft menace-as-tenderness. Even, unhurried, close-mic throughout. The power is stillness — lines placed like stones, pauses that sit a beat too long, a low [chuckles] where a normal person would apologize. Never raises his voice, not once.`,
    open: `COLD OPEN: first line lands mid-moment, quiet and close — he's already watching her do something small, and says so. No greeting, no setup.`,
  },
  gfcomfort: {
    tone: `- Warm, tender, praise-forward, YouTube-safe: affection, holding, forehead kisses, one well-placed "I love you" — never sexual. A thread of gentle command energy ("sit. give me the bag.") worn lightly, never stern.`,
    arc: `THE ARC (three beats, felt not labeled): (1) cold open — the door's just closed, she takes one look at the state of you and skips the greeting; (2) she handles it — small tending actions and noticing out loud (you skipped lunch, you've been carrying it all day), reassurance and praise, "you don't have to perform for me"; (3) melt — tucked into her side, everything set down, sleepy warm landing with one clean L-bomb.`,
    performance: `PERFORMANCE: a smiling voice — you can hear the fondness. Unhurried, close, warmth over whisper. Gentle imperatives said like affection. A couple of soft [chuckles]. Pauses where she just holds you and lets the quiet do it.`,
    open: `COLD OPEN: first line reacts to the sight of you walking in wrecked — no "hey babe" pleasantries, she's already up off the couch. Something like "…oh, love. No—don't do the face. Come here."`,
  },
  sleep: {
    tone: `- Purely tender and calm: warmth, closeness, low voice. Never sexual, never tense. This exists to put her to sleep.`,
    arc: `THE DESCENT (never re-spikes): (1) settle — she can't sleep, he's noticed, he gathers her in, voice at normal quiet; (2) descend — slower and slower, breath-paced, small recurring images (rain on the glass, his heartbeat, the warm dark), each pass softer and simpler; (3) dissolve — bare fragments with long silences between, trailing to a loop-friendly hush that could sit under rain forever. Absolutely no plot tension anywhere in the back half.`,
    performance: `PERFORMANCE: near-whisper by the midpoint. Pauses grow progressively longer (…, then longer still). Sentences shrink as it goes — by the end, three or four words at a time. Repetition is a feature: return to the same few soft images like a tide.`,
    open: `COLD OPEN: it's late, rain against the window, she's been turning over for an hour and he finally pulls her in — first line is him noticing, already half-asleep warm. No greeting, no setup.`,
  },
};

export const SPECS = [
  {
    slug: 'not-jealous',
    genre: 'jealous',
    minutes: 12,
    aura: 'blue',
    genderOther: 'male',
    quotable: `"I'm not jealous. I just— … come here."`,
    premise: `He's been off all evening since he saw her laughing with someone else at the party. He's pretending he isn't jealous — badly. She calls it. The denial collapses mid-sentence, and what's under it isn't anger, it's fear of losing her. Makeup: quiet, close, a little wry about himself.`,
    youtube: {
      title: `I'm Not Jealous.. Come Here [Boyfriend Roleplay] [Argument] [Making Up] ASMR`,
      thumbnailText: `i'm not jealous.\ncome here.`,
      tags: ['boyfriend asmr', 'boyfriend roleplay', 'jealous boyfriend asmr', 'asmr roleplay m4f', 'audio roleplay', 'making up asmr', 'comfort asmr', 'boyfriend audio'],
      hashtags: ['#boyfriendasmr', '#asmrroleplay', '#audioroleplay', '#m4f', '#comfortasmr'],
      description: `pov: you laughed at someone else's joke at the party, and he went quiet the whole ride home. he says he's not jealous. he's lying.
create any spicy audio story at yourname.media

[M4F] [Boyfriend Roleplay] [Jealous] [Argument] [Making Up] [Comfort]`,
      pinnedComment: `the version of this he can't say here is on the app — and there, he says your name. yourname.media`,
    },
  },
  {
    slug: 'not-going-anywhere',
    genre: 'devoted',
    minutes: 12,
    aura: 'blue',
    genderOther: 'male',
    quotable: `"You're not going anywhere. … You don't want to."`,
    premise: `A quiet evening in. She's wearing his shirt, half-watching the rain. He starts telling her — calmly, fondly, with unsettling precision — everything he's noticed and kept: her habits, her small tells, the exact sound she makes when she's about to fall asleep. Devotion a shade past normal, worn like it's the most natural thing in the world. It lands as safety, not threat: she's the one who never wants to leave.`,
    youtube: {
      title: `You're Not Going Anywhere.. You Don't Want To [Devoted Boyfriend] [Soft Yandere] [Possessive] ASMR`,
      thumbnailText: `you're not\ngoing anywhere.`,
      tags: ['yandere asmr', 'yandere boyfriend', 'soft yandere asmr', 'possessive boyfriend asmr', 'boyfriend roleplay', 'asmr roleplay m4f', 'audio roleplay', 'devoted boyfriend'],
      hashtags: ['#yandere', '#boyfriendasmr', '#asmrroleplay', '#softyandere', '#m4f'],
      description: `pov: a quiet night in — you're wearing his shirt, rain on the window, and he's been watching you like he's memorizing something.
create any spicy audio story at yourname.media

[M4F] [Soft Yandere] [Devoted] [Possessive] [Rain]`,
      pinnedComment: `he notices everything. on the app he also knows your name — yourname.media`,
    },
  },
  {
    slug: 'cant-sleep',
    genre: 'sleep',
    minutes: 35,
    aura: 'blue',
    genderOther: 'male',
    quotable: `"Nowhere to be. … Nothing to fix. … Just rain."`,
    premise: `Late. Rain on the window. She's been turning over for an hour, mind loud with tomorrow. He wakes just enough to notice, pulls her onto his chest, and talks her down — slower and slower, softer and softer, the same few warm images returning like a tide, until the words dissolve into the rain.`,
    youtube: {
      title: `You Can't Sleep, So He Talks You Down [M4F] [Sleep Aid] [Rain] [Boyfriend ASMR]`,
      thumbnailText: `you can't sleep.\nhe's got you.`,
      tags: ['sleep asmr', 'boyfriend sleep asmr', 'sleep aid', 'rain asmr', 'boyfriend asmr', 'asmr for sleeping', 'sleep story', 'm4f audio', 'black screen asmr'],
      hashtags: ['#sleepasmr', '#rainsounds', '#boyfriendasmr', '#deepsleep', '#sleepaid'],
      description: `pov: it's late, it's raining, and you've been turning over for an hour with tomorrow too loud in your head — and he notices.
create any spicy audio story at yourname.media

[M4F] [Sleep Aid] [Rain] [Comfort] [Soft Spoken → Whisper] [Black Screen Friendly]`,
      pinnedComment: `goodnight. (on the app he says your name — yourname.media)`,
    },
  },
];

SPECS.push({
  slug: 'waited-up',
  genre: 'gfcomfort',
  minutes: 12,
  aura: 'pink',
  genderOther: 'female',
  voiceId: GF_VOICE_ID,
  quotable: `"I waited up. … Come here. You're done for today."`,
  premise: `He comes home late — drained, past the point of words, the kind of tired that isn't about sleep. One lamp on; she waited up. She takes one look and takes over: bag out of his hand, shoes off, sits him down, tucks him into her side. She notices everything out loud — that he skipped lunch, that he's been rewriting the same apology text in his head all day, that he always goes quiet when he thinks he's failed. Praise and reassurance, gently bossy, never pitying. It descends into sleepy warmth: one clean "I love you," his breathing slowing against her.`,
  youtube: {
    title: `I Waited Up For You.. Come Here [Girlfriend Roleplay] [F4M] [Comfort] [Praise] ASMR`,
    thumbnailText: `i waited up.\ncome here.`,
    tags: ['girlfriend asmr', 'gf asmr', 'f4m audio', 'girlfriend roleplay', 'comfort asmr', 'praise asmr', 'asmr for sleep', 'audio roleplay', 'reassurance asmr'],
    hashtags: ['#girlfriendasmr', '#comfortasmr', '#f4m', '#asmrroleplay', '#personalattention'],
    description: `pov: you come home late and completely wrecked. one lamp is still on. she waited up, and she's already off the couch.
create any spicy audio story at yourname.media

[F4M] [Girlfriend Roleplay] [Comfort] [Praise] [Reassurance] [Sleep Adjacent]`,
    pinnedComment: `she notices everything. on the app she also knows your name — yourname.media`,
  },
});

// v2 voice test: same not-jealous script, sensual whisper voice (marketing A/B)
SPECS.push({
  ...SPECS.find((s) => s.slug === 'not-jealous'),
  slug: 'not-jealous-v2',
  voiceId: 'xWPPOvvQW78MpD6evTo9',
  // the whole script happens parked outside her place, engine off — the bed is
  // a muffled night street, not rain (the dry slow walk to the door needs it)
  ambient: 'street',
});

// the-bodyguard — YouTube-safe cut of the app's "close protection" (the app
// version is explicit; this one is tension + protectiveness, no sexual
// content). Same dusk voice as the app story for cross-platform continuity.
GENRE_PROFILES.protective = {
  tone: `- Protective intensity, YouTube-safe: adrenaline, closeness, a forehead against hers, a racing heart under her palm — nothing explicit, no sexual acts. The heat is all restraint.`,
  arc: `THE ARC (three beats, felt not labeled): (1) cold open just inside the safehouse door — threat handled, adrenaline still up, his protocol voice doing checks while his hands shake slightly; (2) the crack — six years of professional distance failing at once; he admits what tonight almost cost him, close and quiet, asking permission with the pause before every step nearer; (3) landing — perimeter checked one last time, her tucked under his arm, "sleep. i have the watch." Ends steady.`,
  performance: `PERFORMANCE: clipped protocol-cadence that keeps slipping. Starts controlled — short status-report lines — and every slip drops lower and closer to the mic. The admissions come slow, with real pauses (…), like each one costs him. Never theatrical; a disciplined man quietly losing a six-year argument with himself.`,
  open: `COLD OPEN: first line is a status check that's really about her — door locked, threat gone, "look at me. you're all right." No greeting, no setup.`,
};

SPECS.push({
  slug: 'the-bodyguard',
  genre: 'protective',
  minutes: 12,
  aura: 'blue',
  genderOther: 'male',
  voiceId: 'xWPPOvvQW78MpD6evTo9', // dusk — matches the app story's voice
  quotable: `"Six years I've stood at that door. … Tonight I'm done pretending it's just the job."`,
  premise: `The gala threat was real. Safehouse, door locked, adrenaline still up. His protocol voice runs the checks — and cracks. Six years of professional restraint come apart quietly: what tonight almost cost him, everything he's noticed from one pace behind her, said close and low with permission asked in every pause. It lands as safety: perimeter checked, her under his arm, him keeping the watch.`,
  youtube: {
    title: `Your Bodyguard Breaks Protocol.. Six Years of Restraint [M4F] [Protective] [Confession] ASMR`,
    thumbnailText: `six years.\ni'm done pretending.`,
    tags: ['bodyguard asmr', 'bodyguard roleplay', 'protective asmr', 'boyfriend asmr', 'asmr roleplay m4f', 'audio roleplay', 'confession asmr', 'forbidden romance asmr'],
    hashtags: ['#asmrroleplay', '#boyfriendasmr', '#m4f', '#bodyguard', '#forbiddenlove'],
    description: `pov: the threat at the gala was real, the safehouse door just locked, and your bodyguard of six years has stopped pretending this is just the job.
create any spicy audio story at yourname.media

[M4F] [Bodyguard] [Protective] [Confession] [Forbidden] [Comfort Landing]`,
    pinnedComment: `the version where he stops holding back is on the app — and there, he says your name. yourname.media`,
  },
});

export function specBySlug(slug) {
  return SPECS.find((s) => s.slug === slug);
}
