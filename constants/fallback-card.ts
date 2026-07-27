/**
 * Last-resort card art for the onboarding storyteller-recap step.
 *
 * Hand-authored monochrome line art in the same 2:3 format the Replicate
 * pipeline produces, designed for CardScene's silver-emboss treatment
 * (light strokes on black rasterize into engraved-looking silver). Used
 * ONLY when tarot generation has repeatedly failed and the user takes the
 * explicit "classic card" escape hatch — and never persisted: the profile
 * self-heal (services/silver-card-image.ts) regenerates the real artwork
 * from the saved scene prompt later.
 */

export const FALLBACK_CARD_DIMS = { width: 800, height: 1200 } as const;

export const FALLBACK_CARD_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1200" viewBox="0 0 800 1200">
<rect width="800" height="1200" fill="#000000"/>
<rect x="28" y="28" width="744" height="1144" rx="18" fill="none" stroke="#e8e8e8" stroke-width="5"/>
<rect x="52" y="52" width="696" height="1096" rx="10" fill="none" stroke="#9a9a9a" stroke-width="2"/>
<path d="M110 82 L116 104 L138 110 L116 116 L110 138 L104 116 L82 110 L104 104 Z" fill="#e8e8e8"/>
<path d="M690 82 L696 104 L718 110 L696 116 L690 138 L684 116 L662 110 L684 104 Z" fill="#e8e8e8"/>
<path d="M110 1062 L116 1084 L138 1090 L116 1096 L110 1118 L104 1096 L82 1090 L104 1084 Z" fill="#e8e8e8"/>
<path d="M690 1062 L696 1084 L718 1090 L696 1096 L690 1118 L684 1096 L662 1090 L684 1084 Z" fill="#e8e8e8"/>
<circle cx="400" cy="215" r="52" fill="#e8e8e8"/>
<circle cx="424" cy="202" r="48" fill="#000000"/>
<circle cx="318" cy="178" r="4" fill="#cfcfcf"/>
<circle cx="482" cy="170" r="4" fill="#cfcfcf"/>
<circle cx="444" cy="268" r="3.5" fill="#cfcfcf"/>
<circle cx="400" cy="640" r="170" fill="none" stroke="#cfcfcf" stroke-width="3"/>
<line x1="585" y1="640" x2="625" y2="640" stroke="#e8e8e8" stroke-width="4"/>
<line x1="560" y1="733" x2="595" y2="752" stroke="#e8e8e8" stroke-width="4"/>
<line x1="493" y1="800" x2="513" y2="835" stroke="#e8e8e8" stroke-width="4"/>
<line x1="400" y1="825" x2="400" y2="865" stroke="#e8e8e8" stroke-width="4"/>
<line x1="307" y1="800" x2="287" y2="835" stroke="#e8e8e8" stroke-width="4"/>
<line x1="240" y1="733" x2="205" y2="752" stroke="#e8e8e8" stroke-width="4"/>
<line x1="215" y1="640" x2="175" y2="640" stroke="#e8e8e8" stroke-width="4"/>
<line x1="240" y1="548" x2="205" y2="528" stroke="#e8e8e8" stroke-width="4"/>
<line x1="307" y1="480" x2="287" y2="445" stroke="#e8e8e8" stroke-width="4"/>
<line x1="400" y1="455" x2="400" y2="415" stroke="#e8e8e8" stroke-width="4"/>
<line x1="493" y1="480" x2="513" y2="445" stroke="#e8e8e8" stroke-width="4"/>
<line x1="560" y1="548" x2="595" y2="528" stroke="#e8e8e8" stroke-width="4"/>
<circle cx="400" cy="640" r="95" fill="none" stroke="#e8e8e8" stroke-width="3"/>
<path d="M310 640 Q400 578 490 640 Q400 702 310 640 Z" fill="none" stroke="#e8e8e8" stroke-width="4"/>
<circle cx="400" cy="640" r="26" fill="#e8e8e8"/>
<circle cx="400" cy="640" r="10" fill="#000000"/>
<path d="M180 1005 Q400 945 620 1005" fill="none" stroke="#9a9a9a" stroke-width="3"/>
<path d="M220 1040 Q400 990 580 1040" fill="none" stroke="#6f6f6f" stroke-width="2"/>
<path d="M330 1051 L339 1065 L330 1079 L321 1065 Z" fill="#e8e8e8"/>
<path d="M400 1068 L409 1082 L400 1096 L391 1082 Z" fill="#e8e8e8"/>
<path d="M470 1051 L479 1065 L470 1079 L461 1065 Z" fill="#e8e8e8"/>
<circle cx="200" cy="420" r="3.5" fill="#cfcfcf"/>
<circle cx="600" cy="420" r="3.5" fill="#cfcfcf"/>
<circle cx="250" cy="880" r="3.5" fill="#cfcfcf"/>
<circle cx="550" cy="880" r="3.5" fill="#cfcfcf"/>
<circle cx="160" cy="640" r="3" fill="#cfcfcf"/>
<circle cx="640" cy="640" r="3" fill="#cfcfcf"/>
</svg>`;

/** data: URL form for native, where CardScene renders an image instead of SVG. */
export function fallbackCardDataUrl(): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(FALLBACK_CARD_SVG)}`;
}
