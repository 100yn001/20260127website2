#!/usr/bin/env node
// Regenerates out/<slug>/upload.md from specs.mjs WITHOUT re-rendering video
// (same template as youtube.mjs). Use after editing titles/descriptions/tags/
// hashtags in specs.
//
//   node scripts/marketing/yt-pipeline/upload-md.mjs [slug ...]   (default: all)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SPECS, specBySlug } from './specs.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'out');

const slugs = process.argv.slice(2);
const targets = slugs.length ? slugs.map((s) => specBySlug(s)).filter(Boolean) : SPECS;

for (const spec of targets) {
  const dir = path.join(OUT, spec.slug);
  if (!fs.existsSync(dir)) { console.log(`— ${spec.slug}: no out dir, skipping`); continue; }
  const files = fs.readdirSync(dir);
  const video = files.find((f) => f.endsWith('.mp4') && !f.includes('preview')) || '(not rendered yet)';
  const thumb = files.find((f) => f.endsWith('-thumb-imessage.png')) || files.find((f) => f.endsWith('-thumb.png')) || '(not rendered yet)';
  const y = spec.youtube;
  const md = `# upload bundle — ${spec.slug}

**video:** ${video} · **thumbnail:** ${thumb}

## title
${y.title}

## description
${y.description}

${y.hashtags.join(' ')}

## tags (comma-separated field)
${y.tags.join(', ')}

## after publishing
- pin this comment: "${y.pinnedComment}"
- add to playlist, set NOT made for kids, schedule at 8-10pm ET
`;
  fs.writeFileSync(path.join(dir, 'upload.md'), md);
  console.log(`✅ ${spec.slug}/upload.md (${y.hashtags.join(' ')})`);
}
