import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { access, chmod, copyFile, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const repository = fileURLToPath(new URL('..', import.meta.url));
const bun = spawnSync('which', ['bun'], { encoding: 'utf8' }).stdout.trim();
const node = spawnSync('which', ['node'], { encoding: 'utf8' }).stdout.trim();
const poison = ['TYPESAFE_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'TENET_POLICY', 'NODE_OPTIONS', 'NODE_PATH', 'BASH_ENV', 'ENV', 'SSH_AUTH_SOCK', 'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'npm_config_userconfig', 'PI_CODING_AGENT_DIR', 'PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH'];
const expected = [
  ['run', 'sdk:build'], ['run', 'inspector:build'], ['run', 'summary:build'], ['run', 'site:build'],
  ['../scripts/check-summary-build.ts'], ['run', 'build:server'], ['run', 'test'], ['run', 'typecheck'],
  ['run', 'delivery:check'],
  ['run', 'inspector:check'], ['run', 'inspector:test'], ['tsc', '--noEmit'], ['vitest', 'run', '--config', 'vitest.config.ts'],
];

type RecordEntry = { args: string[]; cwd: string; home: string; root: string; env: Record<string, string>; regular: boolean; pid: number; probes?: unknown[] };

async function fixture(control: Record<string, unknown> = {}) {
  const root = await realpath(await mkdtemp('/tmp/tenet-lane-test-'));
  try {
    for (const dir of ['scripts', 'bin', 'cache', 'nested', 'bb-plugin-tenet-status/node_modules/.bin']) await mkdir(join(root, dir), { recursive: true });
    await copyFile(join(repository, 'scripts/validate-offline.sh'), join(root, 'scripts/validate-offline.sh'));
    await writeFile(join(root, 'control.json'), JSON.stringify(control));
    const pkg = JSON.parse(await readFile(join(repository, 'package.json'), 'utf8'));
    await writeFile(join(root, 'package.json'), JSON.stringify({ type: 'module', scripts: { test: pkg.scripts.test, nested: 'bun probe.cjs' } }));
    await writeFile(join(root, '.env'), 'TYPESAFE_API_KEY=dotenv-canary\nTENET_POLICY=dotenv-policy\nVITE_OFFLINE_CANARY=loaded\n');
    await copyFile(join(root, '.env'), join(root, '.env.production'));
    await copyFile(join(root, '.env'), join(root, 'nested/.env'));
    await writeFile(join(root, 'probe.cjs'), `console.log(JSON.stringify({home:require('node:os').homedir(),realHome:require('node:fs').realpathSync(require('node:os').homedir()),homeMode:require('node:fs').statSync(require('node:os').homedir()).mode & 0o777,key:process.env.TYPESAFE_API_KEY,policy:process.env.TENET_POLICY}));`);
    await copyFile(join(root, 'probe.cjs'), join(root, 'nested/probe.cjs'));
    await writeFile(join(root, 'startup-hook'), `echo touched > '${root}/hook-ran'\n`);
    await writeFile(join(root, 'suite.test.ts'), `import {test} from 'bun:test';
import {appendFileSync,fstatSync} from 'node:fs';
if(globalThis.offlineIsolationCanary) throw new Error('test globals leaked between files');
globalThis.offlineIsolationCanary=true;
let active=0;
for(const name of ['first','second']) test.concurrent(name,async()=>{
  active++; if(active!==1)throw new Error('concurrent suite despite max-concurrency=1');
  await new Promise(resolve=>setTimeout(resolve,20)); active--;
});
test('suite uses regular-file diagnostics',()=>{
  if(!fstatSync(1).isFile() || !fstatSync(2).isFile()) throw new Error('suite output is not a regular file');
  appendFileSync('suite-ran', 'yes'); console.log('suite-stdout'); console.error('suite-stderr');
});`);
    await writeFile(join(root, 'isolation.test.ts'), `import {test} from 'bun:test';
if(globalThis.offlineIsolationCanary)throw new Error('test globals leaked between files');
globalThis.offlineIsolationCanary=true;
test('isolated file',()=>{});`);
    await writeFile(join(root, 'record.cjs'), `const fs=require('node:fs'),cp=require('node:child_process'),os=require('node:os');
const root=${JSON.stringify(root)}, realBun=${JSON.stringify(bun)}, node=${JSON.stringify(node)};
const args=process.argv.slice(2),control=JSON.parse(fs.readFileSync(root+'/control.json'));
const entry={args,cwd:process.cwd(),home:os.homedir(),root:process.env.TMPDIR,env:process.env,regular:fs.fstatSync(1).isFile()&&fs.fstatSync(2).isFile(),pid:process.pid};
if(args.join(' ')==='run sdk:build'){
 fs.mkdirSync(root+'/unsafe-permission-fixture',{mode:0o755});
 if((fs.statSync(root+'/unsafe-permission-fixture').mode&0o777)!==0o755)throw new Error('runner masked explicit unsafe fixture permissions');
 entry.probes=[];
 for(const command of [[realBun,'probe.cjs'],['bun','probe.cjs'],[realBun,'run','nested'],[realBun,'-e',\"const {spawnSync}=require('node:child_process');const p=spawnSync(process.execPath,['probe.cjs'],{encoding:'utf8',cwd:'nested'});process.stdout.write(p.stdout);process.exit(p.status)\"]]){
   const p=cp.spawnSync(command[0],command.slice(1),{cwd:root,encoding:'utf8'});if(p.status!==0)throw new Error(JSON.stringify({command,status:p.status,error:p.error,stderr:p.stderr,stdout:p.stdout}));entry.probes.push(JSON.parse(p.stdout));
 }
 const p=cp.spawnSync(node,['probe.cjs'],{cwd:root,encoding:'utf8'});if(p.status!==0)throw new Error(p.stderr);entry.probes.push(JSON.parse(p.stdout));
 const pathOnly=cp.spawnSync('bun',['probe.cjs'],{cwd:root,encoding:'utf8',env:{PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:process.env.TMPDIR}});
 if(pathOnly.status!==0)throw new Error(pathOnly.stderr);entry.probes.push(JSON.parse(pathOnly.stdout));
}
fs.appendFileSync(root+'/trace.jsonl',JSON.stringify(entry)+'\\n');
if(control.hold===args.join(' ')){
 const child=cp.spawn(node,['-e',\"process.on('SIGINT',()=>process.exit(0));process.on('SIGTERM',()=>\"+(control.stubborn?'{}':'process.exit(0)')+\");setInterval(()=>{},1000)\"],{stdio:'ignore'});
 fs.writeFileSync(root+'/child-pid',String(child.pid));
 process.on('SIGINT',()=>process.exit(130));process.on('SIGTERM',()=>process.exit(143));setInterval(()=>{},1000);
}else if(control.fail===args.join(' ')){console.log('failure-stdout');console.error('failure-stderr');process.exit(37);
}else if(args.join(' ')==='run test'){
 const p=cp.spawnSync(realBun,['run','test'],{stdio:'inherit'});process.exit(p.status??1);
}`);
    const fakeBun = `#!/bin/bash\noptions=()\nif [[ "$1" == --no-env-file ]]; then options=(--no-env-file); shift; fi\ncase "$1" in run|../scripts/check-summary-build.ts) exec ${JSON.stringify(node)} ${JSON.stringify(join(root, 'record.cjs'))} "$@";; *) exec ${JSON.stringify(bun)} "\${options[@]}" "$@";; esac\n`;
    await writeFile(join(root, 'bin/bun'), fakeBun);
    await chmod(join(root, 'bin/bun'), 0o700);
    for (const tool of ['tsc', 'vitest']) {
      const path = join(root, 'bb-plugin-tenet-status/node_modules/.bin', tool);
      await writeFile(path, `#!/bin/bash\nexec ${JSON.stringify(node)} ${JSON.stringify(join(root, 'record.cjs'))} ${tool} "$@"\n`);
      await chmod(path, 0o700);
    }
    const env: NodeJS.ProcessEnv = { ...process.env, PATH: `${root}/bin:${process.env.PATH}`, PLAYWRIGHT_BROWSERS_PATH: `${root}/cache`, BUN_OPTIONS: '--preload=missing-canary', HOME: `${root}/owner` };
    for (const key of poison) env[key] = 'inherited-canary';
    env.BASH_ENV = env.ENV = `${root}/startup-hook`;
    const start = (extra: string[] = [], override: NodeJS.ProcessEnv = {}, cwd = root) => spawn('/usr/bin/env', ['-u', 'BASH_ENV', '-u', 'ENV', '/bin/bash', '--noprofile', '--norc', join(root, 'scripts/validate-offline.sh'), ...extra], { cwd, env: { ...env, ...override }, stdio: ['ignore', 'pipe', 'pipe'] });
    return { root, start, trace: async () => (await readFile(join(root, 'trace.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line) as RecordEntry) };
  } catch (error) { await rm(root, { recursive: true, force: true }); throw error; }
}

function result(child: ReturnType<typeof spawn>) {
  let stdout = '', stderr = '';
  child.stdout!.on('data', chunk => { stdout += chunk; });
  child.stderr!.on('data', chunk => { stderr += chunk; });
  return new Promise<{ code: number | null; signal: string | null; stdout: string; stderr: string }>((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code, signal) => resolve({ code, signal, stdout, stderr }));
  });
}

async function absent(path: string) { await assert.rejects(access(path), { code: 'ENOENT' }); }

for (const failure of [undefined, 'run test', 'run inspector:build', 'run delivery:check']) {
  test(`offline lane has fixed order, isolated descendants and cleanup (${failure ?? 'success'})`, async () => {
    const f = await fixture({ fail: failure });
    try {
      const output = await result(f.start());
      assert.equal(output.code, failure ? 37 : 0, output.stdout + output.stderr);
      assert.equal(output.signal, null);
      const trace = await f.trace();
      const count = failure ? expected.findIndex(args => args.join(' ') === failure) + 1 : expected.length;
      assert.deepEqual(trace.map(entry => entry.args), expected.slice(0, count));
      for (const entry of trace) {
        const plugin = ['../scripts/check-summary-build.ts', 'run build:server', 'tsc --noEmit', 'vitest run --config vitest.config.ts'].includes(entry.args.join(' '));
        assert.equal(entry.cwd, plugin ? `${f.root}/bb-plugin-tenet-status` : f.root);
        assert.match(entry.root, /^\/(?:private\/)?tmp\/tenet-offline\.[^/]+$/);
        assert.equal(entry.home, `${entry.root}/home`);
        for (const key of poison) {
          if (key === 'npm_config_userconfig' || key === 'PI_CODING_AGENT_DIR') assert.ok(entry.env[key]?.startsWith(`${entry.home}/`));
          else assert.equal(entry.env[key], undefined, key);
        }
        assert.equal(entry.env.BUN_OPTIONS, '--no-env-file');
        assert.equal(entry.env.PLAYWRIGHT_BROWSERS_PATH, `${f.root}/cache`);
        for (const key of ['XDG_CONFIG_HOME', 'XDG_CACHE_HOME', 'XDG_DATA_HOME', 'npm_config_cache', 'npm_config_globalconfig']) assert.ok(entry.env[key]?.startsWith(`${entry.home}/`));
      }
      assert.ok(trace[0], 'fixture reached the first prerequisite');
      assert.deepEqual(trace[0].probes, Array(6).fill({ home: trace[0].home, realHome: trace[0].home, homeMode: 0o700 }));
      await absent(trace[0].root);
      await absent(`${f.root}/hook-ran`);
      await access(`${f.root}/cache`);
      if (failure === 'run test') {
        assert.equal(trace.at(-1)!.regular, true);
        assert.match(output.stdout, /failure-stdout/);
        assert.match(output.stdout, /failure-stderr/);
      } else if (!failure) {
        assert.equal(await readFile(`${f.root}/suite-ran`, 'utf8'), 'yes');
        assert.match(output.stdout, /\$ bun test --isolate --max-concurrency=1 --timeout=30000\n/);
        assert.match(output.stdout, /suite-stdout/);
        assert.match(output.stdout, /suite-stderr/);
      }
    } finally { await rm(f.root, { recursive: true, force: true }); }
  });
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  test(`offline lane forwards ${signal}, waits for children and cleans only its state`, async () => {
    const f = await fixture({ hold: 'run inspector:build', stubborn: signal === 'SIGTERM' });
    const child = f.start();
    const done = result(child);
    try {
      let pid = 0;
      for (let i = 0; i < 200; i++) {
        try { pid = Number(await readFile(`${f.root}/child-pid`, 'utf8')); break; } catch { await sleep(10); }
      }
      assert.ok(pid, 'fixture reached the blocking command');
      await sleep(100);
      child.kill(signal);
      const output = await done;
      assert.equal(output.code, signal === 'SIGINT' ? 130 : 143, output.stderr);
      assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
      const trace = await f.trace();
      assert.deepEqual(trace.map(entry => entry.args), expected.slice(0, 2));
      assert.ok(trace[0], 'fixture recorded the worker state');
      await absent(trace[0].root);
      await access(`${f.root}/cache`);
    } finally { child.kill('SIGKILL'); await rm(f.root, { recursive: true, force: true }); }
  });
}

test('offline lane requires an explicit existing absolute executable cache before builds', async () => {
  const f = await fixture();
  try {
    for (const path of ['', 'relative-cache', `${f.root}/missing`]) {
      const output = await result(f.start([], { PLAYWRIGHT_BROWSERS_PATH: path }));
      assert.equal(output.code, 2);
      assert.match(output.stderr, /existing absolute.*browser.*cache/i);
      await absent(`${f.root}/trace.jsonl`);
    }
    const output = await result(f.start(['--browser-cache', `${f.root}/cache`], { PLAYWRIGHT_BROWSERS_PATH: '' }, `${f.root}/nested`));
    assert.equal(output.code, 0, output.stderr);
    const trace = await f.trace();
    assert.equal(trace[0]?.cwd, f.root);
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

for (const tool of ['cat', 'rm']) {
  for (const fail of [undefined, 'run test']) {
    test(`offline lane preserves status through ${tool} failure (${fail ?? 'success'})`, async () => {
      const f = await fixture({ fail });
      try {
        const executable = join(f.root, 'bin', tool);
        await writeFile(executable, `#!/bin/sh\n${tool === 'rm' ? '/bin/rm "$@"\n' : ''}exit 11\n`);
        await chmod(executable, 0o700);
        const output = await result(f.start());
        assert.equal(output.code, fail ? 37 : tool === 'cat' ? 11 : 1, output.stdout + output.stderr);
        const trace = await f.trace();
        assert.ok(trace[0], 'fixture reached the checks');
        await absent(trace[0].root);
        await access(`${f.root}/cache`);
      } finally { await rm(f.root, { recursive: true, force: true }); }
    });
  }
}

test('framework configurations do not load dotenv in the offline lane', async () => {
  const root = await realpath(await mkdtemp('/tmp/tenet-framework-test-'));
  try {
    for (const name of ['.env', '.env.production', '.env.test']) await writeFile(join(root, name), 'VITE_OFFLINE_CANARY=loaded\n');
    const configs = ['inspector/vite.config.ts', 'inspector/vite.summary.config.ts', 'inspector/vitest.browser.config.ts', 'inspector/vitest.config.ts', 'site/vite.config.ts', 'site/vitest.config.ts', 'bb-plugin-tenet-status/vitest.config.ts'];
    const script = `import {loadConfigFromFile,resolveConfig} from 'vite';
for(const file of ${JSON.stringify(configs)}){
 const loaded=await loadConfigFromFile({command:'build',mode:'production'},file);
 if(!loaded)throw new Error('missing '+file);
 const config=await resolveConfig({...loaded.config,root:${JSON.stringify(root)},configFile:false},'build','production');
 if(config.env.VITE_OFFLINE_CANARY!==undefined)throw new Error('dotenv loaded by '+file);
 console.log(file+' ignored dotenv');
}`;
    const output = spawnSync(bun, ['--no-env-file', '-e', script], { cwd: repository, encoding: 'utf8', env: { PATH: process.env.PATH, HOME: root, BUN_OPTIONS: '--no-env-file' } });
    assert.equal(output.status, 0, output.stdout + output.stderr);
    assert.equal(output.stdout.trim().split('\n').length, configs.length);
  } finally { await rm(root, { recursive: true, force: true }); }
});
