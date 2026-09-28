import { animate, inView, scroll } from 'motion';

const root = document.documentElement;
const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const storedPreference = window.localStorage.getItem('dm-motion');
let reduced = storedPreference ? storedPreference === 'reduced' : mediaQuery.matches;

function setTheme(theme, persist = true) {
  root.dataset.theme = theme;
  const button = document.getElementById('themeToggle');
  const dark = theme === 'dark';
  button?.setAttribute('aria-pressed', String(dark));
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#09080b' : '#f7f2e9');
  if (persist) window.localStorage.setItem('dm-theme', theme);
}

function applyMotionPreference() {
  root.dataset.motion = reduced ? 'reduced' : 'full';
  const button = document.getElementById('motionToggle');
  if (button) {
    button.textContent = `Motion: ${reduced ? 'reduced' : 'full'}`;
    button.setAttribute('aria-pressed', String(reduced));
  }
}

function bindTheme() {
  const saved = window.localStorage.getItem('dm-theme') || root.dataset.theme || 'dark';
  setTheme(saved, false);
  document.getElementById('themeToggle')?.addEventListener('click', () => {
    setTheme(root.dataset.theme === 'dark' ? 'light' : 'dark');
  });
}

function bindMotionToggle() {
  applyMotionPreference();
  document.getElementById('motionToggle')?.addEventListener('click', () => {
    reduced = !reduced;
    window.localStorage.setItem('dm-motion', reduced ? 'reduced' : 'full');
    applyMotionPreference();
  });
}

function bindTilt(card) {
  if (reduced || window.matchMedia('(pointer: coarse)').matches) return;
  const reset = () => {
    card.style.setProperty('--tilt-x', '0deg');
    card.style.setProperty('--tilt-y', '0deg');
    card.style.setProperty('--lift', '0px');
  };
  card.addEventListener('pointermove', event => {
    const rect = card.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width - 0.5;
    const py = (event.clientY - rect.top) / rect.height - 0.5;
    card.style.setProperty('--tilt-x', `${(-py * 5).toFixed(2)}deg`);
    card.style.setProperty('--tilt-y', `${(px * 7).toFixed(2)}deg`);
    card.style.setProperty('--lift', '-6px');
  });
  card.addEventListener('pointerleave', reset);
  card.addEventListener('blur', reset, true);
}

function initialiseMotion() {
  bindTheme();
  bindMotionToggle();

  const progress = document.querySelector('.reading-progress');
  if (progress) scroll(animate(progress, { scaleX: [0, 1] }, { ease: 'linear' }));

  if (reduced) return;

  animate('.home-hero-copy > *', { opacity: [0, 1], y: [28, 0] }, {
    duration: 0.8,
    delay: (_, index) => index * 0.09,
    ease: [0.16, 1, 0.3, 1]
  });

  document.querySelectorAll('.reveal').forEach(element => {
    inView(element, () => animate(element, { opacity: [0, 1], y: [30, 0] }, {
      duration: 0.72,
      ease: [0.16, 1, 0.3, 1]
    }), { amount: 0.16 });
  });

  inView('.cosmic-ledger', element => {
    animate(element.querySelectorAll('.inventory-fill'), { scaleX: [0, 1] }, {
      duration: 1.15,
      delay: (_, index) => index * 0.08,
      ease: [0.16, 1, 0.3, 1]
    });
  }, { amount: 0.35 });

  document.querySelectorAll('.depth-card').forEach(bindTilt);

  document.querySelectorAll('.depth-scene').forEach(scene => {
    const media = scene.querySelector(':scope > img, .hero-media');
    if (!media || window.matchMedia('(pointer: coarse)').matches) return;
    scene.addEventListener('pointermove', event => {
      const rect = scene.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = (event.clientY - rect.top) / rect.height - 0.5;
      media.style.transform = `translate3d(${x * -14}px, ${y * -10}px, 0) scale(1.035)`;
    });
    scene.addEventListener('pointerleave', () => { media.style.transform = ''; });
  });

  const sections = [...document.querySelectorAll('main section[id], main section[aria-labelledby]')];
  const navLinks = [...document.querySelectorAll('.section-nav a')];
  const observer = new IntersectionObserver(entries => {
    const visible = entries.filter(entry => entry.isIntersecting).sort((a,b)=>b.intersectionRatio-a.intersectionRatio)[0];
    if (!visible) return;
    const id = visible.target.id || visible.target.getAttribute('aria-labelledby');
    navLinks.forEach(link => link.classList.toggle('is-active', link.getAttribute('href') === `#${id}`));
  }, { rootMargin: '-35% 0px -55% 0px', threshold: [0.02, 0.2, 0.5] });
  sections.forEach(section => observer.observe(section));
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialiseMotion, { once: true });
else initialiseMotion();
