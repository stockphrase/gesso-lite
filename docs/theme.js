// Read theme from localStorage on load (set by inline script in head).
// This file just wires up the toggle button.
(function() {
  function applyTheme(theme) {
    if (theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
    var label = document.getElementById('gl-theme-label');
    if (label) label.textContent = theme === 'dark' ? 'Light' : 'Dark';
  }

  function getCurrentTheme() {
    return document.documentElement.getAttribute('data-theme') === 'dark'
      ? 'dark' : 'light';
  }

  function toggleTheme() {
    var next = getCurrentTheme() === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('gesso-lite-docs-theme', next); } catch (e) {}
    applyTheme(next);
  }

  document.addEventListener('DOMContentLoaded', function() {
    var btn = document.getElementById('gl-theme-toggle');
    if (btn) btn.addEventListener('click', toggleTheme);
    // Sync the label.
    applyTheme(getCurrentTheme());
  });
})();
