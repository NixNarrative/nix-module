// 1.7.2: every hard-coded activity id must be 16 letters/digits (Foundry refuses anything else).
// 1.7.1 shipped nixVengefulBld0 (15) in the Court fixes and nixLegendProxy0 (15) in Make stat block.
// Scans scripts/, automations/ and ../tools/ for `_id: '...'`, `system.activities.<id>` and `activities.get('<id>')`.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const roots = ['../scripts', '../automations', '../../tools'].map(r => path.join(here, r)).filter(r => fs.existsSync(r));
const files = [];
const walk = d => { for (const e of fs.readdirSync(d, {withFileTypes: true})) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (!/^(_to_delete|node_modules)$/.test(e.name)) walk(p); }
    else if (/\.(m?js)$/.test(e.name)) files.push(p);
} };
roots.forEach(walk);
const res = [/_id:\s*['"]([A-Za-z0-9]+)['"]/g, /system\.activities\.([A-Za-z0-9]{6,})['"]/g, /activities\.get\(['"]([A-Za-z0-9]+)['"]\)/g,
    /system\.activities\.-=([A-Za-z0-9]{6,})['"]/g, /\b(nix[A-Za-z0-9]+):\s*\{\s*_id/g];
const bad = [];
for (const f of files) {
    const s = fs.readFileSync(f, 'utf8');
    for (const re of res) for (const m of s.matchAll(re)) if (m[1].length !== 16) bad.push(path.relative(path.join(here, '..'), f) + ': ' + m[1]);
}
assert.ok(files.length > 50, 'no source files found'); assert.deepEqual([...new Set(bad)], [], 'activity ids that are not 16 characters:\n' + bad.join('\n'));
console.log('activity ids: ' + files.length + ' files, all 16 characters');
