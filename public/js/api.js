// Shared frontend helpers

export function getToken() {
  return localStorage.getItem('pw_token');
}
export function setToken(token) {
  localStorage.setItem('pw_token', token);
}
export function clearToken() {
  localStorage.removeItem('pw_token');
}

export async function api(path, { method = 'GET', body } = {}) {
  const headers = { 'content-type': 'application/json' };
  const token = getToken();
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message ?? data.error ?? `HTTP ${res.status}`);
    err.status = res.status;
    err.details = data.details;
    throw err;
  }
  return data;
}

export function fmtTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

export function esc(str) {
  const div = document.createElement('div');
  div.textContent = String(str ?? '');
  return div.innerHTML;
}

/** Renders a small up/down sparkline from recent checks (oldest → newest). */
export function sparkline(checks) {
  const sorted = [...checks].sort((a, b) => a.checkedAt.localeCompare(b.checkedAt)).slice(-30);
  return `<div class="sparkline" title="Recent checks">${sorted
    .map((c) => `<span class="${c.status}" style="height:${Math.max(4, Math.min(28, c.durationMs / 40))}px"></span>`)
    .join('')}</div>`;
}
