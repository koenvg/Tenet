import { readFile, stat, writeFile } from 'node:fs/promises';
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';

const [input, output] = process.argv.slice(2);
const limit = 12 * 1024 * 1024;
if ((await stat(input)).size > limit) throw new Error('compressed trace byte limit exceeded');
let bytes = 0, files = 0;
const entries = unzipSync(await readFile(input), { filter: entry => {
  if (++files > 512 || (bytes += entry.originalSize) > 24 * 1024 * 1024) throw new Error('expanded trace limit exceeded');
  return !entry.name.endsWith('.network') && !entry.name.endsWith('.stacks') && !entry.name.startsWith('resources/src@');
} });
const scrub = (key, value) => {
  if (/headers|cookies|authorization|storageState/i.test(key)) return '[omitted]';
  if (typeof value === 'string') {
    return value.replace(/https?:\/\/[^\s"'<>`\\)]+/g, match => {
      try { const url = new URL(match); return `${url.origin}${url.pathname}`; } catch { return '[invalid URL omitted]'; }
    });
  }
  return value;
};
for (const [name, value] of Object.entries(entries)) {
  if (name.endsWith('.trace')) {
    entries[name] = strToU8(strFromU8(value).split('\n').filter(Boolean).map(line => JSON.stringify(JSON.parse(line), scrub)).join('\n') + '\n');
  }
}
const result = zipSync(entries);
if (result.byteLength > limit) throw new Error('retained trace byte limit exceeded');
await writeFile(output, result);
