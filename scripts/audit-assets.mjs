#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';

const registry = JSON.parse(readFileSync('docs/asset-provenance.json', 'utf8'));
const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
const assetExt = /\.(png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf|eot|mp3|m4a|wav|ogg|flac|mp4|webm|pdf)$/i;
const textExt = /\.(css|html|js|jsx|ts|tsx|md)$/i;
const discovered = files.filter((file) => assetExt.test(file));
for (const file of files.filter((f) => textExt.test(f))) {
  const stat = statSync(file);
  if (stat.size > 2 * 1024 * 1024) continue;
  const source = readFileSync(file, 'utf8');
  const matches = [...source.matchAll(/data:(?:image|font|audio|video)\/[a-z0-9.+-]+(?:;[^,]*)?,/gi)];
  matches.forEach((_, index) => discovered.push(file + '#embedded-' + (index + 1)));
}
const registered = registry.localAssets.map((item) => item.path);
const missing = discovered.filter((item) => !registered.includes(item));
const stale = registered.filter((item) => !discovered.includes(item));
console.log('Tracked media/font/document assets:', discovered.length);
console.log('Registered assets:', registered.length);
for (const item of discovered) {
  const record = registry.localAssets.find((entry) => entry.path === item);
  console.log((record ? record.status : 'UNREGISTERED').padEnd(32), item);
}
if (missing.length || stale.length) {
  console.error('Unregistered:', missing);
  console.error('Stale registry entries:', stale);
  process.exit(1);
}
console.log('Asset inventory is structurally complete. Human rights/provenance confirmations remain separate.');
