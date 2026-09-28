import { cpSync, copyFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

const ROOT_ASSETS = [
  'app.js',
  'physicsWorker.js',
  'rotationPhysics.js',
  'lensingPhysics.js',
  'cosmologyPhysics.js',
  'futuresPhysics.js'
];

function preserveScientificRuntime() {
  return {
    name: 'preserve-scientific-runtime',
    closeBundle() {
      const output = resolve('dist');
      mkdirSync(output, { recursive: true });
      for (const file of ROOT_ASSETS) copyFileSync(resolve(file), resolve(output, file));
      cpSync(resolve('data'), resolve(output, 'data'), { recursive: true });
      cpSync(resolve('assets'), resolve(output, 'assets'), { recursive: true });
    }
  };
}

export default defineConfig({
  base: '/dark-matter-rotation-curve-lab/',
  plugins: [tailwindcss(), preserveScientificRuntime()],
  build: {
    target: 'es2022',
    sourcemap: true
  }
});
