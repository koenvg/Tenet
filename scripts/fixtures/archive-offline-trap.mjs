import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import cp from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';

// Preload for the ACTUAL delivered CLI. Count attempts even if product code catches errors.
let attempts = 0;
const originals = [];
const fail = () => { attempts++; throw new Error('offline-side-effect-forbidden'); };
const replace = (object, key, value) => { originals.push([object, key, object[key]]); object[key] = value; };
replace(globalThis, 'fetch', fail); replace(globalThis, 'setInterval', fail);
for (const module of [http, https]) for (const key of ['request', 'get']) replace(module, key, fail);
replace(net, 'connect', fail); replace(net, 'createConnection', fail); replace(net.Socket.prototype, 'connect', fail); replace(tls, 'connect', fail);
for (const key of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']) replace(cp, key, fail);
for (const key of ['watch', 'watchFile', 'writeFile', 'writeFileSync', 'mkdir', 'mkdirSync', 'rename', 'renameSync',
  'unlink', 'unlinkSync', 'rm', 'rmSync', 'createWriteStream', 'chmod', 'chmodSync']) replace(fs, key, fail);
for (const key of ['writeFile', 'mkdir', 'rename', 'unlink', 'rm', 'chmod']) replace(fsp, key, fail);
for (const [module, key] of [[fs, 'openSync'], [fsp, 'open']]) {
  const original = module[key];
  replace(module, key, (path, flags, ...args) => {
    if (flags !== 'r' && flags !== 'rs' && (typeof flags !== 'number' || (flags & 3) !== 0)) fail();
    return original(path, flags, ...args);
  });
}
syncBuiltinESMExports();
process.once('beforeExit', () => { if (attempts) process.exitCode = 99; });
export function assertNoAttempts() { if (attempts) throw new Error('offline side effect attempted'); }
export function restore() {
  for (const [object, key, original] of originals.reverse()) object[key] = original;
  syncBuiltinESMExports(); assertNoAttempts();
}
