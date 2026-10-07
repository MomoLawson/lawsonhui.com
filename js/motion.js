import { data } from './settings.js?v=3cbb48d67c';

export function initMotion() {
  const topbar = document.getElementById('topbar');
  const toTop = document.querySelector('[data-action="to-top"]');
  const isIndex = document.documentElement.dataset.page === 'index';
  const offset = (data.topbar && data.topbar.blendOffset) || 24;
  const reduce = document.documentElement.dataset.motion === 'reduced';
  const root = document.documentElement;
  root.dataset.jsReady = '1';
  root.dataset.reveal = 'ready';

  const onScroll = () => {
    if (topbar && isIndex) topbar.classList.toggle('is-scrolled', window.scrollY > offset);
    if (toTop) toTop.hidden = window.scrollY < 520;
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  const nodes = Array.from(document.querySelectorAll('.reveal'));
  if (reduce || !('IntersectionObserver' in window)) {
    nodes.forEach(node => node.classList.add('is-visible'));
    return;
  }

  const observer = new IntersectionObserver(
    entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { rootMargin: '0px 0px -6% 0px', threshold: 0.06 }
  );
  nodes.forEach(node => observer.observe(node));
}
