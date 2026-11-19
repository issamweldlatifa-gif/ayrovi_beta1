for (const figure of document.querySelectorAll('[data-switcher]')) {
  const tabs = [...figure.querySelectorAll('[role="tab"]')];
  const select = (index, focus = false) => {
    tabs.forEach((tab, position) => {
      const selected = position === index;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      document.getElementById(tab.getAttribute('aria-controls')).hidden = !selected;
    });
    if (focus) tabs[index].focus();
  };
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => select(index));
    tab.addEventListener('keydown', event => {
      const rtl = document.documentElement.dir === 'rtl';
      const step = event.key === 'ArrowRight' ? (rtl ? -1 : 1) : event.key === 'ArrowLeft' ? (rtl ? 1 : -1) : 0;
      if (!step && !['Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      select(step ? (index + step + tabs.length) % tabs.length : event.key === 'Home' ? 0 : tabs.length - 1, true);
    });
  });
  figure.querySelector('.screen-tabs').hidden = false;
}
