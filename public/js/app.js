import { api, getToken, setToken, clearToken, fmtTime, esc, sparkline } from './api.js';

const $ = (sel) => document.querySelector(sel);

let authMode = 'login';
let monitors = [];
let filter = { text: '', state: 'all' };
let eventSource = null;

// ---------- Auth ----------

function showAuth() {
  $('#auth-view').classList.remove('hidden');
  $('#dash-view').classList.add('hidden');
}

function showDash() {
  $('#auth-view').classList.add('hidden');
  $('#dash-view').classList.remove('hidden');
  refresh().then(connectStream);
}

$('#auth-toggle').addEventListener('click', (e) => {
  e.preventDefault();
  authMode = authMode === 'login' ? 'register' : 'login';
  $('#auth-submit').textContent = authMode === 'login' ? 'Sign in' : 'Create account';
  $('#auth-subtitle').textContent =
    authMode === 'login' ? 'Sign in to your monitoring dashboard' : 'Create your PulseWatch account';
  $('#auth-toggle-line').innerHTML =
    authMode === 'login'
      ? 'No account? <a href="#" id="auth-toggle">Create one</a>'
      : 'Already registered? <a href="#" id="auth-toggle">Sign in</a>';
  // rebind since innerHTML replaced the link
  $('#auth-toggle').addEventListener('click', arguments.callee ? () => location.reload() : () => {});
  location.hash = authMode;
});

// Simpler robust approach: delegate toggle clicks.
document.addEventListener('click', (e) => {
  if (e.target?.id === 'auth-toggle') {
    e.preventDefault();
    authMode = authMode === 'login' ? 'register' : 'login';
    $('#auth-submit').textContent = authMode === 'login' ? 'Sign in' : 'Create account';
    $('#auth-subtitle').textContent =
      authMode === 'login'
        ? 'Sign in to your monitoring dashboard'
        : 'Create your PulseWatch account';
    $('#auth-toggle-line').innerHTML =
      authMode === 'login'
        ? 'No account? <a href="#" id="auth-toggle">Create one</a>'
        : 'Already registered? <a href="#" id="auth-toggle">Sign in</a>';
  }
});

$('#auth-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = $('#auth-error');
  errEl.classList.add('hidden');
  try {
    const data = await api(`/api/auth/${authMode}`, {
      method: 'POST',
      body: {
        email: $('#email').value,
        password: $('#password').value,
      },
    });
    setToken(data.token);
    showDash();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  }
});

$('#logout-btn').addEventListener('click', () => {
  clearToken();
  eventSource?.close();
  showAuth();
});

// ---------- Monitors ----------

async function refresh() {
  try {
    const data = await api('/api/monitors');
    monitors = data.monitors;
    $('#loading-skeleton')?.classList.add('hidden');
    $('#load-error').classList.add('hidden');
    render();
    renderActivity();
  } catch (err) {
    if (err.status === 401) {
      clearToken();
      showAuth();
      return;
    }
    $('#load-error').textContent = `Failed to load monitors: ${err.message}`;
    $('#load-error').classList.remove('hidden');
  }
}

/** Derives the effective monitor state including degraded. */
function monitorState(m) {
  if (!m.enabled) return 'paused';
  if (m.openIncident) return 'down';
  return 'up';
}

function visibleMonitors() {
  return monitors.filter((m) => {
    const state = monitorState(m);
    if (filter.state !== 'all' && state !== filter.state) return false;
    const q = filter.text.toLowerCase();
    if (q && !`${m.name} ${m.url}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

function responseTimeChart(m) {
  // Build a mini chart from recentChecks durations (oldest → newest).
  const checks = [...(m.recentChecks ?? [])].sort((a, b) => a.checkedAt.localeCompare(b.checkedAt)).slice(-40);
  if (!checks.length) return '';
  const max = Math.max(...checks.map((c) => c.durationMs), 1);
  const bars = checks
    .map(
      (c) =>
        `<span class="bar ${c.status === 'down' ? 'has-down' : ''}" style="height:${Math.max(4, Math.round((c.durationMs / max) * 56))}px" title="${esc(c.durationMs)}ms"></span>`
    )
    .join('');
  return `<div class="rt-chart" title="Response time, oldest → newest">${bars}</div>`;
}

function render() {
  const up = monitors.filter((m) => monitorState(m) === 'up').length;
  const down = monitors.filter((m) => monitorState(m) === 'down').length;
  const paused = monitors.filter((m) => !m.enabled).length;
  const avgUptime = (() => {
    const vals = monitors.map((m) => m.uptime24h).filter((v) => v !== null && v !== undefined);
    if (!vals.length) return '—';
    return `${(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2)}%`;
  })();
  const avgResponse = (() => {
    const vals = monitors.flatMap((m) => (m.recentChecks ?? []).map((c) => c.durationMs)).filter(Boolean);
    if (!vals.length) return '—';
    return `${Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)}ms`;
  })();

  $('#summary-cards').innerHTML = [
    ['Total', monitors.length],
    ['Up', up],
    ['Down', down],
    ['Paused', paused],
    ['Avg uptime 24h', avgUptime],
    ['Avg response', avgResponse],
  ]
    .map(
      ([label, num]) =>
        `<div class="card"><div class="num">${esc(num)}</div><div class="label">${esc(label)}</div></div>`
    )
    .join('');

  const list = visibleMonitors();
  $('#empty-state').classList.toggle('hidden', list.length > 0);
  $('#monitor-list').innerHTML = list
    .map((m) => {
      const state = monitorState(m);
      return `
      <article class="monitor-item" role="listitem" data-id="${m.id}">
        <div class="monitor-main">
          <div class="monitor-name">${esc(m.name)}</div>
          <div class="monitor-url">${esc(m.url)} · every ${m.intervalSeconds}s · timeout ${m.timeoutMs ?? 8000}ms</div>
          <div class="stat-inline">
            <span>fail≥${m.failureThreshold ?? 2}</span><span>recover≥${m.recoveryThreshold ?? 2}</span>
            ${m.uptime24h != null ? `<span>${m.uptime24h.toFixed(2)}% uptime</span>` : '<span>no data</span>'}
          </div>
          ${m.openIncident ? `<div class="error-text small">Down: ${esc(m.openIncident.lastError ?? '')} since ${fmtTime(m.openIncident.startedAt)}</div>` : ''}
        </div>
        <div style="flex:1.2;min-width:160px">
          ${sparkline(m.recentChecks ?? [])}
          ${responseTimeChart(m)}
        </div>
        <span class="badge ${state}">${state}</span>
        <div class="monitor-actions">
          <button class="btn" data-action="check">Check now</button>
          <button class="btn ghost" data-action="toggle">${m.enabled ? 'Pause' : 'Resume'}</button>
          <button class="btn danger" data-action="delete">Delete</button>
        </div>
      </article>`;
    })
    .join('');
}

/** Renders the cross-monitor incident activity feed. */
async function renderActivity() {
  try {
    // Fetch recent incidents for each monitor in parallel.
    const results = await Promise.all(
      monitors.slice(0, 20).map(async (m) => {
        try {
          const data = await api(`/api/monitors/${m.id}/incidents`);
          return data.incidents.map((i) => ({ ...i, monitorName: m.name }));
        } catch {
          return [];
        }
      })
    );
    const all = results.flat().sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt))).slice(0, 12);
    const feed = $('#activity-feed');
    if (!all.length) {
      feed.innerHTML = '<p class="muted">No incidents recorded yet. 🎉</p>';
      return;
    }
    feed.innerHTML = all
      .map(
        (i) => `
      <div class="activity-item">
        <span class="activity-dot ${i.resolvedAt ? 'resolved' : 'opened'}"></span>
        <span>${i.resolvedAt ? 'Recovered' : 'Incident opened'} — <strong>${esc(i.monitorName)}</strong>${i.lastError ? ` · ${esc(i.lastError)}` : ''}</span>
        <span class="activity-time">${fmtTime(i.resolvedAt ?? i.startedAt)}</span>
      </div>`
      )
      .join('');
  } catch {
    $('#activity-feed').innerHTML = '<p class="muted">Activity unavailable.</p>';
  }
}

$('#monitor-list').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const item = btn.closest('[data-id]');
  const id = item.dataset.id;
  const action = btn.dataset.action;
  btn.disabled = true;
  try {
    if (action === 'check') {
      await api(`/api/monitors/${id}/check`, { method: 'POST' });
      await refresh();
    } else if (action === 'toggle') {
      const m = monitors.find((x) => x.id === id);
      await api(`/api/monitors/${id}`, { method: 'PATCH', body: { enabled: !m.enabled } });
      await refresh();
    } else if (action === 'delete') {
      if (confirm('Delete this monitor and all of its history? This cannot be undone.')) {
        await api(`/api/monitors/${id}`, { method: 'DELETE' });
        await refresh();
      }
    }
  } catch (err) {
    alert(`Action failed: ${err.message}`);
  } finally {
    btn.disabled = false;
  }
});

// ---------- Create dialog ----------

const dialog = $('#monitor-dialog');
$('#new-monitor-btn').addEventListener('click', () => {
  $('#monitor-error').classList.add('hidden');
  dialog.showModal();
});
$('#monitor-cancel').addEventListener('click', () => dialog.close());
$('#monitor-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = $('#monitor-error');
  errEl.classList.add('hidden');
  try {
    await api('/api/monitors', {
      method: 'POST',
      body: {
        name: $('#m-name').value,
        url: $('#m-url').value,
        intervalSeconds: Number($('#m-interval').value),
        expectedStatus: Number($('#m-status').value),
      },
    });
    dialog.close();
    e.target.reset();
    await refresh();
  } catch (err) {
    errEl.textContent = err.details?.map((d) => `${d.path}: ${d.message}`).join('; ') || err.message;
    errEl.classList.remove('hidden');
  }
});

// ---------- Filtering ----------

$('#search-input').addEventListener('input', (e) => {
  filter.text = e.target.value;
  render();
});
$('#state-filter').addEventListener('change', (e) => {
  filter.state = e.target.value;
  render();
});

// ---------- Live updates (SSE) ----------

function connectStream() {
  eventSource?.close();
  eventSource = new EventSource(`/api/stream?token=${encodeURIComponent(getToken())}`);
  eventSource.addEventListener('check', () => refresh());
  // Auto-reconnect on error (EventSource retries automatically unless closed).
  eventSource.onerror = () => {
    if (eventSource.readyState === EventSource.CLOSED) {
      setTimeout(connectStream, 3000);
    }
  };
}

// ---------- Boot ----------

if (getToken()) {
  showDash();
} else {
  showAuth();
}
