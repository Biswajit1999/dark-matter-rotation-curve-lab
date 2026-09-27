'use strict';

importScripts('rotationPhysics.js?v=2.0.0-beta.2');

self.onmessage = event => {
  const { requestId, action = 'evaluate', params, reference, samplerOptions } = event.data;
  try {
    const payload = action === 'fit'
      ? RotationPhysics.gridFit(params, reference)
      : action === 'sample'
        ? RotationPhysics.samplePosterior(params, reference, samplerOptions)
        : { params, result: RotationPhysics.evaluate(params, reference, true) };
    self.postMessage({ requestId, action, ...payload });
  } catch (error) {
    self.postMessage({ requestId, action: 'error', message: error instanceof Error ? error.message : String(error) });
  }
};
