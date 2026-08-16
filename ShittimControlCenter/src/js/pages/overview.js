import { el, frag, clear, button, toast } from '../ui.js';

export default {
  id: 'overview',
  title: 'Overview',
  icon: 'dashboard',
  needsTarget: false,

  mount(root) {
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
        el('p', { text: 'Bundles the server log and a diagnostic snapshot into a zip to attach to bug reports. Prerequisites and setup live under Configuration.', style: { fontSize: '12.5px', color: 'var(--ink-3)', margin: '12px 0 0', lineHeight: '1.6' } })));

    root.appendChild(offlineCard);
    root.appendChild(el('div.grid-2', { style: { alignItems: 'start', marginTop: '18px' } }, shortcutsCard, diagnostics));

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

    loadOffline();
  },
};

function cardWith(title, sub, actions, body) {
  const head = el('div.card-head', {}, el('span.tab-mark', {}), el('h3', { text: title }),
    sub ? el('span.sub', { text: sub }) : null, el('div.spacer', {}), ...actions);
  return el('div.card', {}, head, el('div.card-body', {}, body));
}
