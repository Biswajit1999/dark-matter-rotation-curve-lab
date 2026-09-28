(function () {
  'use strict';

  const root = document.documentElement;
  const storageKey = 'dm-theme';

  function readTheme() {
    try {
      return localStorage.getItem(storageKey) || root.dataset.theme || 'dark';
    } catch (_) {
      return root.dataset.theme || 'dark';
    }
  }

  function applyTheme(theme, persist = true) {
    const next = theme === 'light' ? 'light' : 'dark';
    root.dataset.theme = next;

    const toggle = document.getElementById('themeToggle');
    if (toggle) {
      const dark = next === 'dark';
      toggle.setAttribute('aria-pressed', String(dark));
      toggle.dataset.theme = next;
      toggle.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
    }

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', next === 'dark' ? '#09080b' : '#f7f2e9');

    if (persist) {
      try { localStorage.setItem(storageKey, next); } catch (_) {}
    }
  }

  function bind() {
    applyTheme(readTheme(), false);
    const toggle = document.getElementById('themeToggle');
    if (!toggle || toggle.dataset.themeBound === 'true') return;
    toggle.dataset.themeBound = 'true';
    toggle.addEventListener('click', () => {
      applyTheme(root.dataset.theme === 'dark' ? 'light' : 'dark');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind, { once: true });
  } else {
    bind();
  }

  window.DarkMatterTheme = {
    get: () => root.dataset.theme || readTheme(),
    set: applyTheme
  };
}());
