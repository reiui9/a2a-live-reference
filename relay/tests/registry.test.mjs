import test from 'node:test';
import assert from 'node:assert/strict';
import { createRegistryApp } from '../packages/registry/src/index.ts';

async function start(app) {
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const { port } = server.address();
  return { server, base: `http://127.0.0.1:${port}` };
}

test('registry: register requires key and discover filters capability', async () => {
  const app = createRegistryApp('k1');
  const { server, base } = await start(app);
  try {
    const bad = await fetch(`${base}/agents/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'a' })
    });
    assert.equal(bad.status, 401);

    const ok = await fetch(`${base}/agents/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-registry-key': 'k1' },
      body: JSON.stringify({ name: 'alpha', capabilities: ['negotiate', 'quote'] })
    });
    assert.equal(ok.status, 201);

    const all = await (await fetch(`${base}/discover`)).json();
    assert.equal(all.count, 1);

    const filtered = await (await fetch(`${base}/discover?capability=negotiate`)).json();
    assert.equal(filtered.count, 1);

    const miss = await (await fetch(`${base}/discover?capability=execute`)).json();
    assert.equal(miss.count, 0);
  } finally {
    server.close();
  }
});
