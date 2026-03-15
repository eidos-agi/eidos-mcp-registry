/**
 * Navigation — Tab state management.
 * The nav rail is static HTML; this module handles keyboard shortcuts.
 */

export function initNav() {
  // Keyboard shortcuts for tab switching
  document.addEventListener('keydown', (e) => {
    if (e.altKey && e.key === '1') { import('./registry.js').then(m => m.switchTab('servers')); }
    if (e.altKey && e.key === '2') { import('./registry.js').then(m => m.switchTab('groups')); }
    if (e.altKey && e.key === '3') { import('./registry.js').then(m => m.switchTab('store')); }
  });
}
