import { el, frag, clear, button, toast } from '../ui.js';

function diagRow(name, info, fixBtn) {
  const status = info?.status || 'missing';
  const row = frag(`<div class="diag-row">
    <span class="d-led ${status}"></span>
    <span class="d-name">${name}</span>
    <span class="d-detail">${(info?.detail || '').replace(/</g, '&lt;')}</span>
  </div>`);
  if (fixBtn) row.appendChild(fixBtn);
  return row;
}

export default {
  id: 'overview',
  title: 'Overview',
  icon: 'dashboard',
  needsTarget: false,

  mount(root) {
    const diagBody = el('div.diag', { style: { minWidth: '0' } });

    let busy = false;
    const refreshBtn = button('Re-check', { variant: 'ghost', sm: true, iconName: 'refresh', onClick: () => loadDiag() });
    const setupBtn = button('Install missing', { variant: 'primary', sm: true, iconName: 'download', onClick: () => runSetup('all') });
    const readiness = cardWith('Environment readiness', null, [setupBtn, refreshBtn], diagBody);

    const shortcutBody = el('div.row.wrap', { style: { gap: '10px', minWidth: '0' } });
    const shortcuts = [
      ['Server folder', 'folder', (p) => p.serverDir],
      ['Proxy scripts', 'folder', (p) => p.scriptsDir],
      ['Config file', 'config', (p) => p.configPath],
      ['Database', 'inventory', (p) => p.dbPath],
    ];
    for (const [label, ic, pick] of shortcuts) {
      shortcutBody.appendChild(button(label, { variant: 'ghost', sm: true, iconName: ic, onClick: async () => {
        const p = await window.host.paths();
        window.host.openPath(pick(p));
      }}));
    }
    const shortcutsCard = cardWith('Shortcuts', null, [], shortcutBody);

    const hostsLine = el('p', { style: { fontSize: '12.5px', color: 'var(--ink-3)', margin: '12px 0 0', lineHeight: '1.6' } });
    const offlineBtn = button('Start offline', { variant: 'primary', iconName: 'play', onClick: () => startOffline() });
    const hostsBtn = button('Restore hosts file', { variant: 'ghost', sm: true, iconName: 'x', onClick: () => clearHosts() });
    const offlineCard = cardWith('Offline mode', 'No route out, no name server', [],
      el('div', {},
        el('div.row.wrap', { style: { gap: '10px', minWidth: '0' } }, offlineBtn, hostsBtn),
        el('p', { text: 'Brings the server and the proxy up with their offline switches on and points every host the client contacts at loopback, so nothing it asks for needs a name server or a route out. Steam still has to be running - offline mode is fine, but the client reads the SDK version back before it will boot at all.', style: { fontSize: '12.5px', color: 'var(--ink-3)', margin: '12px 0 0', lineHeight: '1.6' } }),
        hostsLine));

    const exportBtn = button('Export logs', { variant: 'ghost', iconName: 'save', onClick: async () => {
      exportBtn.disabled = true;
      try {
        const r = await window.host.exportLogs();
        if (!r || r.canceled) return;
        if (r.ok) {
          toast(`Bundled ${r.count} file${r.count === 1 ? '' : 's'} into ${r.name}.`, 'good', 'Logs exported');
          window.host.revealPath(r.path);
        } else {
          toast(r.error || 'Could not export logs.', 'bad', 'Export failed');
        }
      } catch (e) {
        toast(String(e.message || e), 'bad', 'Export failed');
      } finally {
        exportBtn.disabled = false;
      }
    }});
    const diagnostics = cardWith('Diagnostics', null, [],
      el('div', {}, exportBtn,
        el('p', { text: 'Bundles the server log and a diagnostic snapshot into a zip to attach to bug reports.', style: { fontSize: '12.5px', color: 'var(--ink-3)', margin: '12px 0 0', lineHeight: '1.6' } })));

    const right = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '18px', minWidth: '0' } }, offlineCard, shortcutsCard, diagnostics);
    root.appendChild(el('div.grid-2', { style: { gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 1fr)', alignItems: 'start' } }, readiness, right));

    // Whatever the node offers when it is not ready: its installer as a button,
    // or its explanation as an inline note. Never nothing - a non-ready row with
    // no way forward is the dead end this rebuild exists to remove.
    function nodeAction(node) {
      if (node.status === 'ready') return null;
      if (node.canInstall && !busy) {
        const label = node.action === 'trust' ? 'Trust cert' : 'Install';
        return button(label, { variant: 'ghost', sm: true, iconName: 'download', onClick: () => runSetup(node.id) });
      }
      if (node.explain) return el('span.d-explain', { text: node.explain, style: { fontSize: '11.5px', color: 'var(--ink-3)', flexBasis: '100%', marginTop: '4px' } });
      return null;
    }

    async function loadDiag() {
      diagBody.innerHTML = `<div class="empty"><div class="spinner"></div></div>`;
      try {
        const env = await window.host.envCheck();
        clear(diagBody);
        for (const node of env.nodes)
          diagBody.appendChild(diagRow(node.label, node, nodeAction(node)));
        const anyInstallable = env.nodes.some((n) => n.blocking && n.canInstall && n.status !== 'ready');
        setupBtn.disabled = busy || !anyInstallable;
      } catch (e) {
        diagBody.innerHTML = `<div class="empty"><b>Check failed</b><span>${String(e.message || e)}</span></div>`;
      }
    }

    async function loadOffline() {
      try {
        const s = await window.host.offlineStatus();
        hostsBtn.style.display = s.hosts ? '' : 'none';
        hostsLine.textContent = s.hosts
          ? `${s.hostnames.length} hosts point at 127.0.0.2. Stopping the server puts the file back.`
          : 'The hosts file has not been touched.';
      } catch (e) {
        hostsLine.textContent = String(e.message || e);
      }
    }

    async function startOffline() {
      offlineBtn.disabled = true;
      try {
        const r = await window.host.systemStartOffline();
        if (r.ok) toast('Server and proxy are coming up offline.', 'good', 'Offline mode');
        else toast(r.error || 'Could not start offline.', 'bad', 'Offline mode');
      } catch (e) {
        toast(String(e.message || e), 'bad', 'Offline mode');
      } finally {
        offlineBtn.disabled = false;
        loadOffline();
      }
    }

    async function clearHosts() {
      hostsBtn.disabled = true;
      try {
        const r = await window.host.offlineHosts(false);
        if (!r.ok) toast(r.error || 'Could not edit the hosts file.', 'bad', 'Offline mode');
      } catch (e) {
        toast(String(e.message || e), 'bad', 'Offline mode');
      } finally {
        hostsBtn.disabled = false;
        loadOffline();
      }
    }

    // The .NET SDK download (~250 MB) is silent for minutes, so a spinner plus an always-ticking elapsed counter is what stops it reading as "hung".
    function setupPanel() {
      const titleEl = el('div', { style: { fontWeight: '700', fontSize: '13.5px' } });
      const subEl = el('div', { style: { fontSize: '12px', color: 'var(--ink-3)', marginTop: '3px' } });
      const logEl = el('div.mono', { style: { fontSize: '11px', color: 'var(--ink-3)', marginTop: '9px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: '0' } });
      const wrap = el('div', { style: { display: 'flex', gap: '13px', alignItems: 'flex-start', padding: '16px 4px' } },
        frag('<div class="spinner"></div>'),
        el('div', { style: { minWidth: '0', flex: '1' } }, titleEl, subEl, logEl));
      return { wrap, titleEl, subEl, logEl };
    }

    function fmtMB(n) { return `${(n / (1024 * 1024)).toFixed(0)} MB`; }

    // mitmproxy/.NET install per-user (silent); trusting the CA raises one Windows elevation prompt.
    async function runSetup(which) {
      if (busy) return;
      busy = true;
      setupBtn.disabled = true; refreshBtn.disabled = true;
      const labels = { dotnet: '.NET 10 SDK', mitmproxy: 'mitmproxy', certificate: 'CA certificate' };

      clear(diagBody);
      const panel = setupPanel();
      diagBody.appendChild(panel.wrap);

      // The backend sends the resolved plan as its first event; until it arrives
      // there is no step to name, so the panel says so rather than guessing .NET.
      let plan = null;
      let curStep = which === 'all' ? null : which;
      let msg = 'Starting...';
      const t0 = Date.now();
      const elapsed = () => { const s = Math.floor((Date.now() - t0) / 1000); const m = Math.floor(s / 60); return m ? `${m}m ${s % 60}s` : `${s}s`; };
      const stepName = (id) => labels[id] || id;
      const render = () => {
        const pos = plan && curStep ? ` (${plan.indexOf(curStep) + 1}/${plan.length})` : '';
        panel.titleEl.textContent = curStep ? `Installing ${stepName(curStep)}${pos}...` : 'Working out what needs installing...';
        panel.subEl.textContent = `${msg} - ${elapsed()} elapsed`;
      };
      render();
      // tick every second so the elapsed time always moves, even while a step is mid-download and emitting nothing
      const timer = setInterval(render, 1000);

      const unsub = window.host.onSetupProgress((d) => {
        if (Array.isArray(d.plan)) { plan = d.plan; if (!curStep) curStep = plan[0] || null; }
        if (d.step && labels[d.step]) curStep = d.step;
        if (typeof d.recv === 'number' && d.total) msg = `Downloading... ${fmtMB(d.recv)} / ${fmtMB(d.total)}`;
        else if (d.status === 'running' && d.message) msg = d.message;
        if (d.line) panel.logEl.textContent = d.line;
        if (d.status === 'done') { msg = d.message || `${labels[d.step] || d.step} ready`; toast(msg, 'good'); }
        if (d.status === 'failed') { msg = d.message || `${labels[d.step] || d.step} failed`; toast(msg, 'bad'); }
        render();
      });

      try {
        const res = await window.host.setupInstall(which);
        if (res.ok) toast('All prerequisites are ready.', 'good', 'Setup complete');
        else {
          const failed = Object.entries(res.results || {}).filter(([, r]) => r && !r.ok).map(([k]) => labels[k] || k);
          toast(failed.length ? `Couldn't complete: ${failed.join(', ')}.` : (res.error || 'Setup did not finish.'), 'bad', 'Setup incomplete');
        }
      } catch (e) {
        toast(String(e.message || e), 'bad', 'Setup failed');
      } finally {
        clearInterval(timer);
        unsub();
        busy = false;
        refreshBtn.disabled = false;
        await loadDiag();
      }
    }

    loadDiag();
    loadOffline();
  },
};

function cardWith(title, sub, actions, body) {
  const head = el('div.card-head', {}, el('span.tab-mark', {}), el('h3', { text: title }),
    sub ? el('span.sub', { text: sub }) : null, el('div.spacer', {}), ...actions);
  return el('div.card', {}, head, el('div.card-body', {}, body));
}
