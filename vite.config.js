import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        cosmicBudget: resolve(import.meta.dirname, 'cosmic-budget.html'),
        darkMatterEvidenceEssay: resolve(import.meta.dirname, 'essay-dark-matter-evidence.html'),
        galaxyRotationEssay: resolve(import.meta.dirname, 'essay-galaxy-rotation.html'),
        clusterLensingEssay: resolve(import.meta.dirname, 'essay-cluster-lensing.html'),
        earlyUniverseEssay: resolve(import.meta.dirname, 'essay-early-universe.html'),
        darkSectorApplicationsEssay: resolve(import.meta.dirname, 'essay-dark-sector-applications.html'),
        futureTechnologiesEssay: resolve(import.meta.dirname, 'essay-future-technologies.html')
      }
    }
  }
});
