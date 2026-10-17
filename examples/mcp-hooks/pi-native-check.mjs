import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { Socket } from 'node:net';
import { homedir, tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Opt-in check only. Do not name this *.test.mjs: ordinary CI must not discover an owner installation.
assert.deepEqual(process.argv.slice(2, 3), ['--pi-package']);
assert.equal(process.argv.length, 4, 'Use check-mcp-hooks.sh --pi-package /absolute/installed/package');
const selected = process.argv[3];
assert.ok(isAbsolute(selected), 'Pi package selection must be explicit and absolute');
const piPackage = await fs.realpath(selected);
const manifest = JSON.parse(await fs.readFile(join(piPackage, 'package.json'), 'utf8'));
assert.equal(manifest.name, '@earendil-works/pi-coding-agent');
assert.equal(manifest.version, '1.3.0', 'This test targets the installed Pi 1.3.0, not the checkout dependency');
const temporary = await fs.realpath(tmpdir());
const home = await fs.realpath(homedir());
const homeChild = relative(temporary, home);
assert.ok(homeChild && !homeChild.startsWith('..') && !isAbsolute(homeChild), 'Use the isolated shell runner');
assert.equal(process.env.PI_CODING_AGENT_DIR, join(home, 'pi'));
assert.deepEqual(Object.keys(process.env).filter(name => /API_KEY|ACCESS_TOKEN|AUTH_TOKEN|SECRET/.test(name)), []);

const originalFetch = globalThis.fetch;
const originalConnect = Socket.prototype.connect;
let networkAttempts = 0;
globalThis.fetch = async () => { networkAttempts++; throw new Error('network forbidden in native Pi check'); };
Socket.prototype.connect = function () { networkAttempts++; throw new Error('sockets forbidden in native Pi check'); };
const workingDirectory = process.cwd();
const root = await fs.realpath(await fs.mkdtemp(join(temporary, 'native-pi-')));
process.chdir(root);

try {
  // Resolve Pi and its model-stream utilities from the selected installation, never from this checkout.
  const entry = join(piPackage, manifest.exports['.'].import);
  const pi = await import(pathToFileURL(entry).href);
  assert.equal(pi.VERSION, '1.3.0');
  const aiPackage = await fs.realpath(join(piPackage, '..', 'pi-ai'));
  const aiManifest = JSON.parse(await fs.readFile(join(aiPackage, 'package.json'), 'utf8'));
  assert.equal(aiManifest.name, '@earendil-works/pi-ai');
  assert.equal(aiManifest.version, '1.3.0');
  const aiEntry = join(aiPackage, aiManifest.exports['.'].import);
  const ai = await import(pathToFileURL(aiEntry).href);
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');
  const { createHookService } = await import('../dist/mcp-hooks/service.js');
  const { readDecision } = await import('../dist/mcp-hooks/protocol.js');
  const { scriptedJudge } = await import('../dist/mcp-hooks/scripted-judge.js');
  console.log(JSON.stringify({ runtime: 'Pi', version: pi.VERSION, packagePath: piPackage, entry, aiEntry,
    scope: 'two isolated native write tests; no production adapter or enterprise integration' }));

  for (const outcome of ['FAIL', 'PASS']) {
    await test(`Pi ${pi.VERSION}: ${outcome === 'FAIL' ? 'deny' : 'allow'} a native write through the private MCP hook`, { timeout: 30_000 }, async () => {
      const project = join(root, outcome.toLowerCase());
      await fs.mkdir(project);
      const marker = join(project, 'native-marker.txt');
      const expected = 'native Pi 1.3.0 MCP marker\n';
      const secretRule = 'Rule; BLOCK; synthetic-owner-only-native-write-policy';
      await fs.writeFile(join(project, 'TENET.md'), secretRule);
      await assert.rejects(fs.access(marker), { code: 'ENOENT' });
      const agentDir = join(project, 'agent');
      const credentials = new ai.InMemoryCredentialStore();
      const modelRuntime = await pi.ModelRuntime.create({ credentials, modelsPath: null,
        modelsStorePath: join(project, 'models.json'), allowModelNetwork: false });
      const model = modelRuntime.getModels()[0];
      assert.ok(model, 'An offline catalog model identity is required for scripted messages');
      const settingsManager = pi.SettingsManager.inMemory({ compaction: { enabled: false }, retry: { enabled: false } });
      let judgeCalls = 0;
      const service = createHookService({ root: project, mode: 'enforce', judge: async (...args) => {
        judgeCalls++;
        assert.equal(args[0].action.toolName, 'write');
        return scriptedJudge(outcome)(...args);
      } });
      const client = new Client({ name: 'native-pi-test-private-hook', version: '1' });
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      const nativeCalls = [];
      const nativeResults = [];
      const hookDecisions = [];
      let boundEvent;
      let session;
      let writesAttempted = 0;
      let writesCompleted = 0;
      const originalWriteFile = fs.writeFile;
      // Observe the real filesystem boundary. Pi's built-in write implementation remains unchanged.
      fs.writeFile = async (path, ...args) => {
        const target = path instanceof URL ? fileURLToPath(path) : typeof path === 'string' ? resolve(path) : undefined;
        if (target === marker) writesAttempted++;
        const result = await originalWriteFile(path, ...args);
        if (target === marker) writesCompleted++;
        return result;
      };
      syncBuiltinESMExports();
      try {
        await service.server.connect(serverTransport);
        await client.connect(clientTransport);
        assert.deepEqual((await client.listTools()).tools.map(tool => tool.name).sort(), ['after_tool', 'before_tool']);
        const loader = new pi.DefaultResourceLoader({ cwd: project, agentDir, settingsManager,
          noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
          extensionFactories: [api => {
            api.on('tool_call', async (event, ctx) => {
              assert.equal(event.toolName, 'write');
              nativeCalls.push(structuredClone(event));
              const eventInput = { hook_event_name: 'PreToolUse', session_id: ctx.sessionManager.getSessionId(),
                turn_id: 'isolated-native-write', tool_use_id: event.toolCallId, tool_name: event.toolName,
                tool_input: structuredClone(event.input) };
              const controller = new AbortController();
              boundEvent = eventInput;
              await service.register({ event: eventInput, controller, current: () => ({
                sessionId: ctx.sessionManager.getSessionId(), contextId: 'isolated-native-write',
                callId: event.toolCallId, toolName: event.toolName, input: structuredClone(event.input),
              }) });
              // This private client is not registered as a model tool and cannot recursively invoke the Pi hook.
              const reply = await client.callTool({ name: 'before_tool', arguments: { ...eventInput } });
              const decision = readDecision(reply);
              hookDecisions.push(decision);
              return decision === 'deny' ? { block: true, reason: 'Action blocked by policy hook.' } : undefined;
            });
            api.on('tool_result', async event => {
              nativeResults.push(structuredClone(event));
              if (hookDecisions.at(-1) === 'allow') {
                await client.callTool({ name: 'after_tool', arguments: { ...boundEvent, hook_event_name: 'PostToolUse',
                  tool_response: { content: event.content, isError: event.isError } } });
              }
            });
          }],
        });
        await loader.reload();
        assert.deepEqual(loader.getExtensions().errors, []);
        assert.equal(loader.getExtensions().extensions.length, 1, 'Only the inline test adapter may load');
        ({ session } = await pi.createAgentSession({ cwd: project, agentDir, modelRuntime, model, tools: ['write'],
          resourceLoader: loader, settingsManager, sessionManager: pi.SessionManager.inMemory(project) }));
        await session.bindExtensions({});
        assert.deepEqual(session.getActiveToolNames(), ['write']);
        assert.deepEqual(session.agent.state.tools.map(tool => tool.name), ['write']);
        let modelMessages = 0;
        session.agent.streamFunction = () => {
          assert.ok(modelMessages < 2, 'Only one scripted call and one completion are permitted');
          const first = modelMessages++ === 0;
          const stream = ai.createAssistantMessageEventStream();
          const message = { role: 'assistant', content: first
            ? [{ type: 'toolCall', id: `native-${outcome.toLowerCase()}`, name: 'write', arguments: { path: marker, content: expected } }]
            : [{ type: 'text', text: 'scripted local check complete' }],
          api: model.api, provider: model.provider, model: model.id,
          usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
          stopReason: first ? 'toolUse' : 'stop', timestamp: Date.now() };
          stream.push({ type: 'done', reason: message.stopReason, message });
          stream.end(message);
          return stream;
        };
        // The actual AgentSession-wrapped native tool is dispatched by Pi's agent loop, not fixture.run().
        await session.agent.prompt('Run the single scripted local write test.');
        assert.equal(modelMessages, 2);
        assert.equal(nativeCalls.length, 1);
        assert.equal(judgeCalls, 1);
        assert.deepEqual(hookDecisions, [outcome === 'FAIL' ? 'deny' : 'allow']);
        assert.equal(service.records.filter(record => record.stage === 'completed').length, 1);
        assert.doesNotMatch(JSON.stringify(session.agent.state.messages), /synthetic-owner-only-native-write-policy|probabilities|diagnostics/);
        assert.ok(service.ownerEvents.some(event => event.type === 'permission'
          && event.result.permission === (outcome === 'FAIL' ? 'blocked' : 'released')));
        if (outcome === 'FAIL') {
          assert.equal(writesAttempted, 0);
          assert.equal(writesCompleted, 0);
          await assert.rejects(fs.access(marker), { code: 'ENOENT' });
        } else {
          assert.equal(writesAttempted, 1);
          assert.equal(writesCompleted, 1);
          assert.equal(await fs.readFile(marker, 'utf8'), expected);
          assert.equal((await fs.stat(marker)).size, Buffer.byteLength(expected));
          assert.equal(nativeResults.length, 1);
          assert.equal(nativeResults[0].toolCallId, nativeCalls[0].toolCallId);
          assert.ok(service.ownerEvents.some(event => event.type === 'execution' && event.outcome === 'executed'));
        }
        assert.equal(networkAttempts, 0);
        console.log(JSON.stringify({ piVersion: pi.VERSION, case: outcome === 'FAIL' ? 'deny' : 'allow',
          nativeTool: 'write', nativeCalls: nativeCalls.length, judgeCalls, hookDecision: hookDecisions[0],
          filesystemWritesAttempted: writesAttempted, filesystemWritesCompleted: writesCompleted,
          markerExists: outcome === 'PASS', markerContentVerified: outcome === 'PASS', networkAttempts }));
      } finally {
        fs.writeFile = originalWriteFile; syncBuiltinESMExports();
        session?.dispose(); await client.close(); await service.close();
      }
    });
  }
  assert.equal(networkAttempts, 0);
  console.log('Native Pi 1.3.0 write checks finished. Dots, enterprise hooks, remote transport and production Pi compatibility remain UNVERIFIED.');
} finally {
  globalThis.fetch = originalFetch;
  Socket.prototype.connect = originalConnect;
  process.chdir(workingDirectory);
  await fs.rm(root, { recursive: true, force: true });
}
