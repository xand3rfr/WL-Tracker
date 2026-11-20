// builds sculpted character meshes off the main thread
import { meshCharacter } from './charspec.js';

self.onmessage = e => {
  const { id, P, opts, detail } = e.data;
  const { meshes, face } = meshCharacter(P, { ...opts, tattoos: new Set(opts.tattoos), detail });
  const transfer = [];
  for (const m of Object.values(meshes)) for (const k of ['position', 'normal', 'skinIndex', 'skinWeight', 'color', 'ink', 'uv', 'index']) if (m[k]) transfer.push(m[k].buffer);
  self.postMessage({ id, meshes, face }, transfer);
};
