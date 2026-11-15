/* Slopitaire account — display helpers: avatars, names, sync times and server URLs. */
'use strict';

const GOOGLE_G_SVG =
  '<svg class="acct-g-svg" viewBox="0 0 24 24" aria-hidden="true">' +
  '<path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>' +
  '<path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>' +
  '<path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>' +
  '<path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.54H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>' +
  '</svg>';

function safePictureUrl(url) {
  if (typeof url !== 'string') return '';
  const trimmed = url.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : '';
}

function normalizeServerUrl(raw) {
  const val = String(raw || '').trim();
  if (!val) return '';
  try {
    const u = new URL(val);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    return u.origin + u.pathname.replace(/\/+$/, '');
  } catch (e) {
    return '';
  }
}

function shortDisplayName(user) {
  if (!user) return 'Sign in';
  const raw = String(user.name || user.email || 'Account').trim();
  const first = raw.split(/\s+/)[0];
  if (first.includes('@')) return first.split('@')[0];
  return first || 'Account';
}

function userInitial(user) {
  const src = String(user?.name || user?.email || '?').trim();
  return (src.charAt(0) || '?').toUpperCase();
}

function formatSyncTime(ts) {
  if (!ts) return 'Not synced yet';
  const diff = Math.max(0, Date.now() - ts);
  if (diff < 15000) return 'Just now';
  if (diff < 60000) return Math.floor(diff / 1000) + 's ago';
  if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
  try {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch (e) {
    return 'Recently';
  }
}

function avatarMarkup(user, large = false) {
  const cls = large ? 'acct-avatar lg' : 'acct-avatar';
  const initial = esc(userInitial(user));
  const pic = safePictureUrl(user?.picture);
  if (!pic) {
    return `<span class="${cls} acct-avatar-fallback" aria-hidden="true">${initial}</span>`;
  }
  return (
    `<span class="acct-avatar-wrap">` +
    `<img class="${cls}" src="${esc(pic)}" referrerpolicy="no-referrer" alt="">` +
    `<span class="${cls} acct-avatar-fallback hidden" aria-hidden="true">${initial}</span>` +
    `</span>`
  );
}

function bindAvatarFallbacks(root) {
  if (!root) return;
  root.querySelectorAll('img.acct-avatar').forEach((img) => {
    if (img.dataset.boundFallback) return;
    img.dataset.boundFallback = '1';
    img.addEventListener('error', () => {
      img.classList.add('hidden');
      const fb = img.nextElementSibling;
      if (fb && fb.classList.contains('acct-avatar-fallback')) fb.classList.remove('hidden');
    }, { once: true });
  });
}
