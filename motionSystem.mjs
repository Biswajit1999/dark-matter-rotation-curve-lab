import { animate, inView, scroll } from 'motion';

const root = document.documentElement;
const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const storedPreference = window.localStorage.getItem('dm-motion');
let reduced = storedPreference ? storedPreference === 'reduced' : mediaQuery.matches;

function applyPreference() {
  root.dataset.motion = reduced ? 'reduced' : 'full';
  const button = document.getElementById('motionToggle');
  if (button) {
    button.textContent = `Motion: ${reduced ? 'reduced' : 'full'}`;
    button.setAttribute('aria-pressed', String(reduced));
  }
}

function initialiseMotion() {
  applyPreference();
  const button = document.getElementById('motionToggle');
  button?.addEventListener('click', () => {
    reduced = !reduced;
    window.localStorage.setItem('dm-motion', reduced ? 'reduced' : 'full');
    applyPreference();
  });

  if (reduced) return;

  animate('.hero-statement span', { opacity: [0, 1], y: [18, 0] }, {
    duration: 0.75,
    delay: (_, index) => index * 0.14,
    ease: [0.22, 1, 0.36, 1]
  });

  inView('.cosmic-ledger', element => {
    animate(element.querySelectorAll('.ledger-segment'), { scaleX: [0, 1] }, {
      duration: 0.9,
      delay: (_, index) => index * 0.12,
      ease: [0.22, 1, 0.36, 1]
    });
  }, { amount: 0.45 });

  const progress = document.querySelector('.reading-progress');
  if (progress) scroll(animate(progress, { scaleX: [0, 1] }, { ease: 'linear' }));

  document.querySelectorAll('.inference-chain li').forEach((item, index) => {
    inView(item, () => animate(item, { opacity: [0.35, 1] }, { duration: 0.35, delay: index * 0.025 }), { amount: 0.7 });
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialiseMotion, { once: true });
else initialiseMotion();
