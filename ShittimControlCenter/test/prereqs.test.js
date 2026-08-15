'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { graph, nodeIds, topoOrder, plannedSteps, canInstallNow, nodesWithoutAction } = require('../prereqs.js');

test('every node that can go non-ready offers an install or an explanation', () => {
  assert.deepEqual(nodesWithoutAction(), [], 'these nodes are dead ends: no installer and no explain');
});

test('a dependency is always ordered before the node that needs it', () => {
  const order = topoOrder(graph()).map((n) => n.id);
  for (const n of graph())
    for (const dep of n.dependsOn)
      assert.ok(order.indexOf(dep) < order.indexOf(n.id), `${dep} must come before ${n.id}`);
});

test('a cycle is rejected rather than silently truncated', () => {
  const cyclic = [
    { id: 'a', dependsOn: ['b'], blocking: true, install: false },
    { id: 'b', dependsOn: ['a'], blocking: true, install: false },
  ];
  assert.throws(() => topoOrder(cyclic), /cycle/);
});

test('the plan lists everything missing up front, in dependency order', () => {
  const missing = new Set(nodeIds());
  const plan = plannedSteps(graph(), (id) => (missing.has(id) ? 'missing' : 'ready'));
  assert.deepEqual(plan, ['dotnet', 'mitmproxy', 'certificate']);
  assert.ok(plan.indexOf('mitmproxy') < plan.indexOf('certificate'), 'mitmproxy is planned before the cert that needs it');
});

test('the certificate cannot be installed until mitmproxy is ready', () => {
  const cert = graph().find((n) => n.id === 'certificate');
  assert.equal(canInstallNow(cert, (id) => (id === 'mitmproxy' ? 'missing' : 'ready')), false);
  assert.equal(canInstallNow(cert, () => 'ready'), true);
});

test('advisory and un-installable nodes are never in the plan', () => {
  const plan = plannedSteps(graph(), () => 'missing');
  assert.ok(!plan.includes('database'), 'database is created on first run, not installed');
  assert.ok(!plan.includes('server'), 'server builds on launch, not installed here');
  assert.ok(!plan.includes('redirect'), 'redirect ships with the project, not installed here');
});

test('a ready system yields an empty plan', () => {
  assert.deepEqual(plannedSteps(graph(), () => 'ready'), []);
});
