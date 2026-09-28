import { animate, inView, scroll } from 'motion';

const root = document.documentElement;
const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const validMotion = new Set(['full','reduced','off']);

function initialMotion() {
  let stored = null;
  try { stored = localStorage.getItem('dm-motion'); } catch (_) {}
  if (validMotion.has(stored)) return stored;
  return mediaQuery.matches ? 'reduced' : 'full';
}

let motionMode = initialMotion();

function setMotion(mode, persist = true) {
  motionMode = validMotion.has(mode) ? mode : 'full';
  root.dataset.motion = motionMode;
  const button = document.getElementById('motionToggle');
  if (button) {
    button.textContent = `Motion: ${motionMode}`;
    button.setAttribute('aria-pressed', String(motionMode !== 'off'));
    button.setAttribute('aria-label', `Animation mode: ${motionMode}. Activate to change mode.`);
  }
  if (persist) {
    try { localStorage.setItem('dm-motion', motionMode); } catch (_) {}
  }
  if (motionMode === 'off') document.querySelectorAll('.reveal').forEach(el => { el.style.opacity = '1'; el.style.transform = 'none'; });
}

function cycleMotion() {
  const next = motionMode === 'full' ? 'reduced' : motionMode === 'reduced' ? 'off' : 'full';
  setMotion(next);
}

function bindMotionControl() {
  setMotion(motionMode, false);
  document.getElementById('motionToggle')?.addEventListener('click', cycleMotion);
}

function bindTilt(card) {
  const reset = () => {
    card.style.setProperty('--tilt-x', '0deg');
    card.style.setProperty('--tilt-y', '0deg');
    card.style.setProperty('--lift', '0px');
  };
  card.addEventListener('pointermove', event => {
    if (root.dataset.motion !== 'full' || window.matchMedia('(pointer: coarse)').matches) return;
    const rect = card.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width - 0.5;
    const py = (event.clientY - rect.top) / rect.height - 0.5;
    card.style.setProperty('--tilt-x', `${(-py * 4.2).toFixed(2)}deg`);
    card.style.setProperty('--tilt-y', `${(px * 6).toFixed(2)}deg`);
    card.style.setProperty('--lift', '-5px');
  });
  card.addEventListener('pointerleave', reset);
  card.addEventListener('blur', reset, true);
}

function revealElement(element) {
  const mode = root.dataset.motion;
  if (mode === 'off') {
    element.style.opacity = '1';
    element.style.transform = 'none';
    return;
  }
  const distance = mode === 'full' ? 26 : 8;
  const duration = mode === 'full' ? 0.68 : 0.24;
  animate(element, { opacity: [0,1], y: [distance,0] }, { duration, ease: [0.16,1,0.3,1] });
}

function initialiseMotion() {
  bindMotionControl();

  const progress = document.querySelector('.reading-progress');
  if (progress && root.dataset.motion !== 'off') scroll(animate(progress, { scaleX: [0,1] }, { ease:'linear' }));

  document.querySelectorAll('.reveal').forEach(element => {
    if (root.dataset.motion === 'off') {
      element.style.opacity = '1';
      return;
    }
    inView(element, () => revealElement(element), { amount: 0.14 });
  });

  document.querySelectorAll('.depth-card').forEach(bindTilt);

  document.querySelectorAll('.depth-scene').forEach(scene => {
    const media = scene.querySelector(':scope > img, .hero-media, .frontier-field');
    if (!media) return;
    scene.addEventListener('pointermove', event => {
      if (root.dataset.motion !== 'full' || window.matchMedia('(pointer: coarse)').matches) return;
      const rect = scene.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = (event.clientY - rect.top) / rect.height - 0.5;
      media.style.transform = `translate3d(${x * -10}px,${y * -8}px,0) scale(1.025)`;
    });
    scene.addEventListener('pointerleave', () => { media.style.transform = ''; });
  });

  const sections=[...document.querySelectorAll('main section[id],main section[aria-labelledby]')];
  const nav=[...document.querySelectorAll('.section-nav a')];
  const observer=new IntersectionObserver(entries=>{
    const visible=entries.filter(entry=>entry.isIntersecting).sort((a,b)=>b.intersectionRatio-a.intersectionRatio)[0];
    if(!visible) return;
    const id=visible.target.id||visible.target.getAttribute('aria-labelledby');
    nav.forEach(link=>link.classList.toggle('is-active',link.getAttribute('href')===`#${id}`));
  },{rootMargin:'-35% 0px -55% 0px',threshold:[0.02,0.2,0.5]});
  sections.forEach(section=>observer.observe(section));
}

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',initialiseMotion,{once:true});
else initialiseMotion();
