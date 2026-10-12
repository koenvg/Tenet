import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer, Server } from 'node:http';
import { startInspectorDev } from '../src/inspector/dev.js';

const [scenario, directory] = process.argv.slice(2);
assert.ok(directory && (scenario === 'success' || scenario === 'bind-failure'));
const fixture = createServer((_req, res) => res.end('fixture listener'));

async function listen(server: Server, port: number) {
  const listening = once(server, 'listening');
  server.listen(port, '127.0.0.1');
  await listening;
}

async function close(server: Server) {
  await new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
    server.closeAllConnections();
  });
}

await listen(fixture, 0);
const address = fixture.address();
assert.ok(address && typeof address !== 'string');
const fixturePort = address.port;
const fixtureOrigin = `http://127.0.0.1:${fixturePort}`;
const servers = new Set<Server>();
const ports = new Set<number>();
const nativeListen = Server.prototype.listen;
const sigtermListeners = process.listenerCount('SIGTERM');
// Observe real listener ownership. No bind, Vite or archive behavior is replaced.
Server.prototype.listen = function (this: Server, ...args: unknown[]) {
  servers.add(this);
  this.once('listening', () => {
    const bound = this.address();
    assert.ok(bound && typeof bound !== 'string');
    assert.equal(bound.address, '127.0.0.1');
    ports.add(bound.port);
  });
  if (scenario === 'success') assert.equal(args[0], 0, 'both inspector listeners must request OS-assigned ports');
  return Reflect.apply(nativeListen, this, args);
};
let app: Awaited<ReturnType<typeof startInspectorDev>> | undefined;
try {
  console.log(`${scenario}: startup begins`);
  if (scenario === 'bind-failure') {
    await assert.rejects(startInspectorDev({ directory, port: fixturePort }), /already in use/);
    console.log('bind failure returned');
  } else {
    app = await startInspectorDev({ directory, port: 0 });
    console.log('startup complete');
    assert.equal(ports.size, 2, 'Vite and archive API own distinct ephemeral listeners');
    assert.ok(ports.has(Number(new URL(app.origin).port)));
    const html = await (await fetch(app.origin)).text();
    assert.match(html, /\/@vite\/client/);
    const client = await fetch(`${app.origin}@vite/client`);
    assert.equal(client.status, 200);
    assert.match(await client.text(), /WebSocket/);
    console.log('Vite HTML and client complete');
    const response = await fetch(`${app.origin}api/sessions`);
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json() as { sessions: unknown[] }).sessions, []);
    console.log('archive API proxy complete');
    await app.close();
    app = undefined;
    console.log('inspector teardown complete');
  }
  Server.prototype.listen = nativeListen;
  assert.equal(servers.size, 2, 'both inspector HTTP servers attempted to listen');
  assert.equal(process.listenerCount('SIGTERM'), sigtermListeners, 'Vite teardown removes its process hook');
  for (const server of servers) {
    assert.equal(server.listening, false, 'inspector listener closed');
    assert.equal(server.address(), null);
  }
  assert.equal(ports.size, scenario === 'success' ? 2 : 1);
  assert.equal(await (await fetch(fixtureOrigin)).text(), 'fixture listener', 'startup and cleanup leave the owned occupied listener intact');
  await close(fixture);
  for (const port of ports) {
    await listen(fixture, port);
    await close(fixture);
  }
  await listen(fixture, fixturePort);
  console.log(`${scenario}: ports released`);
} finally {
  Server.prototype.listen = nativeListen;
  await app?.close();
  if (fixture.listening) await close(fixture);
}
