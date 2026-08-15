'use strict';

const NODES = [
  { id: 'project', label: 'Server project', dependsOn: [], blocking: true, install: false,
    explain: 'Downloaded or located from the first-run screen. Everything else depends on it being present.' },
  { id: 'dotnet', label: '.NET SDK', dependsOn: [], blocking: true, install: true },
  { id: 'gateway', label: 'Gateway keys', dependsOn: [], blocking: true, install: false,
    explain: 'Generated automatically the first time the server runs. No key is shared between installs; it appears here as ready once the server has started once.' },
  { id: 'mitmproxy', label: 'mitmproxy', dependsOn: [], blocking: true, install: true },
  { id: 'certificate', label: 'CA certificate', dependsOn: ['mitmproxy'], blocking: true, install: true },
  { id: 'server', label: 'Server build', dependsOn: ['dotnet'], blocking: true, install: false,
    explain: 'Builds automatically the first time you launch. If the project itself is missing, re-download it from the Updates tab.' },
  { id: 'redirect', label: 'Redirect script', dependsOn: [], blocking: true, install: false,
    explain: 'Ships with the server project. Re-download the project from the Updates tab if it is missing.' },
  { id: 'database', label: 'Game database', dependsOn: [], blocking: false, install: false,
    explain: 'Created automatically on the first server run. No action needed.' },
];

function graph() {
  return NODES.map((n) => ({ ...n, dependsOn: [...n.dependsOn] }));
}

function nodeIds() {
  return NODES.map((n) => n.id);
}

function topoOrder(nodes) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const indegree = new Map(nodes.map((n) => [n.id, 0]));
  for (const n of nodes)
    for (const dep of n.dependsOn) {
      if (!byId.has(dep)) throw new Error(`prereq ${n.id} depends on unknown node ${dep}`);
      indegree.set(n.id, indegree.get(n.id) + 1);
    }

  const ready = nodes.filter((n) => indegree.get(n.id) === 0).map((n) => n.id);
  const out = [];
  while (ready.length) {
    const id = ready.shift();
    out.push(byId.get(id));
    for (const n of nodes)
      if (n.dependsOn.includes(id)) {
        indegree.set(n.id, indegree.get(n.id) - 1);
        if (indegree.get(n.id) === 0) ready.push(n.id);
      }
  }

  if (out.length !== nodes.length) throw new Error('prereq graph has a dependency cycle');
  return out;
}

function plannedSteps(nodes, statusOf) {
  return topoOrder(nodes)
    .filter((n) => n.blocking && n.install && statusOf(n.id) !== 'ready')
    .map((n) => n.id);
}

function canInstallNow(node, statusOf) {
  return node.dependsOn.every((dep) => statusOf(dep) === 'ready');
}

function nodesWithoutAction() {
  return NODES.filter((n) => !n.install && !n.explain).map((n) => n.id);
}

module.exports = { graph, nodeIds, topoOrder, plannedSteps, canInstallNow, nodesWithoutAction };
