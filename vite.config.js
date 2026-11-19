import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [{
    name: 'publish-research-evidence',
    generateBundle() {
      const manifestPath = 'evidence/manifest.json';
      const manifest = readFileSync(resolve(import.meta.dirname, manifestPath));
      const { files } = JSON.parse(manifest.toString('utf8'));
      this.emitFile({ type: 'asset', fileName: manifestPath, source: manifest });
      for (const fileName of ['evidence.html', ...files.map(file => file.path)]) {
        const source = readFileSync(resolve(import.meta.dirname, fileName));
        this.emitFile({ type: 'asset', fileName, source });
      }
    }
  }],
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
