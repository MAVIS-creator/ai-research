import { api, fmtTime, esc } from './api.js';

const $ = (sel) => document.querySelector(sel);

function render(data) {
  const banner = $('#overall-banner');
  banner.textContent =
    data.overall === 'operational'
      ? '✅ All systems operational'
      : data.overall === 'degraded'
        ? '⚠️ Some systems are experiencing issues'
        : 'No monitors configured yet';
  banner.className = `banner ${data.overall}`;

  $('#status-list').innerHTML = data.monitors
    .map((m) => {
      // 90 hourly bars, oldest → newest; fill gaps with empty slots.
      const bars = (m.uptimeBars ?? []).slice(-90);
      const barHtml = Array.from({ length: 90 }, (_, i) => {
        const b = bars[i];
        if (!b || b.uptimePercent == null) return '<span class="none" title="No data"></span>';
        const cls = b.uptimePercent >= 99.5 ? '' : b.uptimePercent >= 90 ? 'partial' : 'partial';
        return `<span class="${cls}" title="${esc(b.hour)} — ${b.uptimePercent}% (${b.totalChecks} checks)"></span>`;
      }).join('');
      return `
      <article class="monitor-item">
        <div class="monitor-main">
          <div class="monitor-name">${esc(m.name)}</div>
          ${m.openIncident ? `<div class="error-text small">${esc(m.openIncident.lastError ?? 'Unreachable')} · since ${fmtTime(m.openIncident.startedAt)}</div>` : ''}
          ${m.lastCheck ? `<div class="muted small">Last checked ${fmtTime(m.lastCheck.checkedAt)} · ${m.lastCheck.durationMs}ms</div>` : '<div class="muted small">Awaiting first check</div>'}
          <div class="uptime-bars" title="Hourly uptime, last 90 hours">${barHtml}</div>
        </div>
        <span class="muted small">${m.uptime24h == null ? '' : `${m.uptime24h.toFixed(2)}% uptime (24h)`}</span>
        <span class="badge ${m.state}">${m.state}</span>
      </article>`;
    })
    .join('');

  const incidents = data.recentIncidents ?? [];
  $('#incident-list').innerHTML = incidents.length
    ? incidents
        .map(
          (i) => `
        <div class="incident-item ${i.resolvedAt ? 'resolved' : ''}">
          <strong>${i.resolvedAt ? 'Resolved' : 'Ongoing'}</strong> — started ${fmtTime(i.startedAt)}
          ${i.resolvedAt ? `· resolved ${fmtTime(i.resolvedAt)}` : ''}
          ${i.lastError ? `<div class="muted small">${esc(i.lastError)}</div>` : ''}
        </div>`
        )
        .join('')
    : '<p class="muted">No incidents recorded. 🎉</p>';
}

async function load() {
  try {
    render(await api('/api/public/status'));
  } catch {
    $('#overall-banner').textContent = 'Status temporarily unavailable';
    $('#overall-banner').className = 'banner loading';
  }
}

load();
const es = new EventSource('/api/public/stream');
es.addEventListener('check', load);
es.onerror = () => {
  if (es.readyState === EventSource.CLOSED) setTimeout(() => location.reload(), 5000);
};
