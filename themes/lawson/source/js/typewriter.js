export function createTypewriter(node, options) {
  const noop = { start() {}, stop() {}, setSpeed() {} };
  if (!node) return noop;
  const phrases = (options.phrases || []).filter(Boolean);
  if (!phrases.length) return noop;

  let phraseIndex = 0;
  let charIndex = 0;
  let deleting = false;
  let timer = null;
  let running = false;
  let speed = options.speed || 95;
  const pause = options.pause || 1800;

  const step = () => {
    const phrase = phrases[phraseIndex % phrases.length];
    const texts = phrase.split('\n');
    const flat = texts[0];

    if (!deleting) {
      charIndex += 1;
      node.textContent = flat.slice(0, charIndex);
      if (charIndex >= flat.length) {
        deleting = true;
        timer = window.setTimeout(step, pause);
        return;
      }
      timer = window.setTimeout(step, speed);
    } else {
      charIndex -= 1;
      node.textContent = flat.slice(0, Math.max(0, charIndex));
      if (charIndex <= 0) {
        deleting = false;
        phraseIndex += 1;
        timer = window.setTimeout(step, speed * 4);
        return;
      }
      timer = window.setTimeout(step, Math.max(18, speed / 2.2));
    }
  };

  return {
    start() {
      if (running) return;
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      node.textContent = phrases[0];
      if (reduce) return;
      running = true;
      node.textContent = '';
      charIndex = 0;
      deleting = false;
      timer = window.setTimeout(step, 420);
    },
    stop() {
      running = false;
      if (timer) window.clearTimeout(timer);
      node.textContent = phrases[0];
    },
    setSpeed(value) {
      speed = value || speed;
    }
  };
}
