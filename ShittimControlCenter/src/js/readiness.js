import { el, frag, clear, button, toast } from './ui.js';

const LABELS = { dotnet: '.NET 10 SDK', mitmproxy: 'mitmproxy', certificate: 'CA certificate' };
const fmtMB = (n) => `${(n / (1024 * 1024)).toFixed(0)} MB`;

export function checkEnv() {
  return window.host.envCheck();
}

export function pendingInstalls(env) {
  return (env.nodes || []).filter((n) => n.blocking && n.canInstall && n.status !== 'ready');
}

export function runSetup(which, onProgress) {
  const unsub = window.host.onSetupProgress((d) => { if (onProgress) onProgress(d); });
  return window.host.setupInstall(which).finally(() => { try { unsub(); } catch { /* ignore */ } });
}

function diagRow(node) {
  const status = node.status || 'missing';
  const row = frag(`<div class="diag-row">
    <span class="d-led ${status}"></span>
    <span class="d-name">${node.label}</span>
    <span class="d-detail">${(node.detail || '').replace(/</g, '&lt;')}</span>
  </div>`);
  return row;
}

function nodeAction(node, onInstall, busy) {
  if (node.status === 'ready') return null;
  if (node.canInstall && !busy) {
    const label = node.action === 'trust' ? 'Trust cert' : 'Install';
    return button(label, { variant: 'ghost', sm: true, iconName: 'download', onClick: () => onInstall(node.id) });
  }
  if (node.explain) return el('span.d-explain', { text: node.explain, style: { fontSize: '11.5px', color: 'var(--ink-3)', flexBasis: '100%', marginTop: '4px' } });
  return null;
}

export function mountReadiness(root, { compact = false } = {}) {
  let busy = false;

  const summary = el('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' } });
  const rows = el('div.diag', { style: { minWidth: '0', marginTop: '10px' } });
  const setupBtn = button('Run setup', { variant: 'primary', sm: true, iconName: 'download', onClick: () => install('all') });
  const recheckBtn = button('Re-check', { variant: 'ghost', sm: true, iconName: 'refresh', onClick: load });

  root.appendChild(summary);
  root.appendChild(rows);

  async function load() {
    rows.innerHTML = `<div class="empty"><div class="spinner"></div></div>`;
    let env;
    try { env = await checkEnv(); }
    catch (e) { rows.innerHTML = `<div class="empty"><b>Check failed</b><span>${String(e.message || e)}</span></div>`; return; }

    const pending = pendingInstalls(env);
    clear(summary);
    clear(rows);

    const pill = env.ready
      ? frag('<span class="pill good"><span class="dot"></span>All prerequisites ready</span>')
      : frag(`<span class="pill warn"><span class="dot"></span>${pending.length ? `${pending.length} to install` : 'Needs attention'}</span>`);
    summary.appendChild(pill);
    summary.appendChild(el('div.spacer', { style: { flex: '1' } }));
    if (pending.length) summary.appendChild(setupBtn);
    summary.appendChild(recheckBtn);
    setupBtn.disabled = busy || pending.length === 0;

    const showRows = !compact || !env.ready;
    rows.style.display = showRows ? '' : 'none';
    if (showRows) {
      for (const node of env.nodes) {
        const row = diagRow(node);
        const act = nodeAction(node, install, busy);
        if (act) row.appendChild(act);
        rows.appendChild(row);
      }
    }
  }

  async function install(which) {
    if (busy) return;
    busy = true;
    setupBtn.disabled = recheckBtn.disabled = true;

    clear(rows);
    rows.style.display = '';
    const panel = setupPanel();
    rows.appendChild(panel.wrap);
    const driver = driveProgress(panel, which);

    try {
      const res = await runSetup(which, driver.onEvent);
      if (res.ok) toast('Prerequisites ready.', 'good', 'Setup complete');
      else {
        const failed = Object.entries(res.results || {}).filter(([, r]) => r && !r.ok).map(([k]) => LABELS[k] || k);
        toast(failed.length ? `Couldn't complete: ${failed.join(', ')}.` : (res.error || 'Setup did not finish.'), 'bad', 'Setup incomplete');
      }
    } catch (e) {
      toast(String(e.message || e), 'bad', 'Setup failed');
    } finally {
      driver.stop();
      busy = false;
      recheckBtn.disabled = false;
      await load();
    }
  }

  load();
  return { refresh: load };
}

function setupPanel() {
  const titleEl = el('div', { style: { fontWeight: '700', fontSize: '13px' } });
  const subEl = el('div', { style: { fontSize: '12px', color: 'var(--ink-3)', marginTop: '3px' } });
  const logEl = el('div.mono', { style: { fontSize: '11px', color: 'var(--ink-3)', marginTop: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: '0' } });
  const wrap = el('div', { style: { display: 'flex', gap: '13px', alignItems: 'flex-start', padding: '14px 4px' } },
    frag('<div class="spinner"></div>'),
    el('div', { style: { minWidth: '0', flex: '1' } }, titleEl, subEl, logEl));
  return { wrap, titleEl, subEl, logEl };
}

function driveProgress(panel, which) {
  let plan = null;
  let curStep = which === 'all' ? null : which;
  let msg = 'Starting...';
  const t0 = Date.now();
  const elapsed = () => { const s = Math.floor((Date.now() - t0) / 1000); const m = Math.floor(s / 60); return m ? `${m}m ${s % 60}s` : `${s}s`; };
  const name = (id) => LABELS[id] || id;
  const render = () => {
    const pos = plan && curStep ? ` (${plan.indexOf(curStep) + 1}/${plan.length})` : '';
    panel.titleEl.textContent = curStep ? `Installing ${name(curStep)}${pos}...` : 'Working out what needs installing...';
    panel.subEl.textContent = `${msg} - ${elapsed()} elapsed`;
  };
  render();
  const timer = setInterval(render, 1000);
  return {
    onEvent: (d) => {
      if (Array.isArray(d.plan)) { plan = d.plan; if (!curStep) curStep = plan[0] || null; }
      if (d.step && LABELS[d.step]) curStep = d.step;
      if (typeof d.recv === 'number' && d.total) msg = `Downloading... ${fmtMB(d.recv)} / ${fmtMB(d.total)}`;
      else if (d.status === 'running' && d.message) msg = d.message;
      if (d.line) panel.logEl.textContent = d.line;
      if (d.status === 'done') msg = d.message || `${name(d.step)} ready`;
      if (d.status === 'failed') msg = d.message || `${name(d.step)} failed`;
      render();
    },
    stop: () => clearInterval(timer),
  };
}

export async function autoSetup(notice) {
  let settings = {};
  try { settings = (await window.host.settingsRead()) || {}; } catch { /* defaults */ }
  if (settings.setupAutoDone) return { ran: false };

  let env;
  try { env = await checkEnv(); } catch { return { ran: false }; }

  if (env.ready) { try { window.host.settingsWrite({ setupAutoDone: true }); } catch { /* non-fatal */ } return { ran: false }; }
  if (pendingInstalls(env).length === 0) return { ran: false };

  const barStyle = 'display:flex;align-items:center;gap:10px;padding:9px 14px;margin:8px 16px 0;background:var(--surface-2);border:1px solid var(--line);border-radius:var(--r-sm);font-size:12.5px;color:var(--ink-2)';
  const bar = frag(`<div style="${barStyle}"><div class="spinner"></div><span class="notice-text"></span></div>`);
  const text = bar.querySelector('.notice-text');
  text.textContent = 'Setting up prerequisites...';
  clear(notice); notice.appendChild(bar);

  const panel = { titleEl: { set textContent(v) { text.textContent = v; } }, subEl: { textContent: '' }, logEl: { textContent: '' } };
  const driver = driveProgress(panel, 'all');

  let res;
  try { res = await runSetup('all', driver.onEvent); }
  catch (e) { res = { ok: false, error: String(e.message || e) }; }
  driver.stop();

  clear(notice);
  if (res.ok) {
    try { window.host.settingsWrite({ setupAutoDone: true }); } catch { /* non-fatal */ }
    toast('Prerequisites are ready.', 'good', 'Setup complete');
    return { ran: true, ok: true };
  }

  const warnStyle = 'display:flex;align-items:center;gap:10px;padding:9px 14px;margin:8px 16px 0;background:var(--surface-2);border:1px solid var(--warn, #c9a227);border-radius:var(--r-sm);font-size:12.5px;color:var(--ink-2);flex-wrap:wrap';
  const warn = frag(`<div style="${warnStyle}"><span class="notice-text" style="flex:1;min-width:0">Setup didn't finish on its own. Open Configuration to see what needs attention.</span></div>`);
  const openBtn = button('Open Configuration', { variant: 'ghost', sm: true, onClick: () => { location.hash = '#/config'; clear(notice); } });
  const dismiss = button('Dismiss', { variant: 'ghost', sm: true, onClick: () => clear(notice) });
  warn.appendChild(openBtn); warn.appendChild(dismiss);
  clear(notice); notice.appendChild(warn);
  return { ran: true, ok: false };
}
