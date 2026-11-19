/* PrimeTask Notes shared member navigation behavior */
(() => {
  document.querySelectorAll('.pt-notes-menu-wrap').forEach(wrap => {
    const trigger = wrap.querySelector('.pt-notes-menu-trigger');
    const menu = wrap.querySelector('.pt-notes-menu-dropdown');

    if (!trigger || !menu) return;

    function closeMenu() {
      menu.classList.remove('open');
      trigger.setAttribute('aria-expanded', 'false');
    }

    trigger.addEventListener('click', event => {
      event.stopPropagation();
      const isOpen = menu.classList.toggle('open');
      trigger.setAttribute('aria-expanded', String(isOpen));
    });

    document.addEventListener('click', event => {
      if (!wrap.contains(event.target)) closeMenu();
    });

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && menu.classList.contains('open')) {
        closeMenu();
        trigger.focus();
      }
    });
  });
})();
