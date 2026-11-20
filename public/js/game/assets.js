import * as THREE from '../../vendor/three.module.min.js';
import { RGBELoader } from '../../vendor/jsm/loaders/RGBELoader.js';

// CC0 textures from ambientCG and sounds from OpenGameArt; see public/assets/CREDITS.md
const TEX = '/assets/tex/';
const loader = new THREE.TextureLoader();
const cache = new Map();

// returns immediately; the image streams in and the material updates when it lands
export function tex(name, { repeat = 1, srgb = false, rotation = 0 } = {}) {
  const key = `${name}|${repeat}|${srgb}|${rotation}`;
  if (cache.has(key)) return cache.get(key);
  const t = loader.load(TEX + name);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  const [rx, ry] = Array.isArray(repeat) ? repeat : [repeat, repeat];
  t.repeat.set(rx, ry);
  if (rotation) { t.center.set(0.5, 0.5); t.rotation = rotation; }
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, t);
  return t;
}

const envCache = new WeakMap();
export function nightEnvironment(renderer) {
  if (envCache.has(renderer)) return envCache.get(renderer);
  const p = new Promise(resolve => {
    new RGBELoader().load(TEX + 'night_env.hdr', hdr => {
      const pm = new THREE.PMREMGenerator(renderer);
      const env = pm.fromEquirectangular(hdr).texture;
      hdr.dispose(); pm.dispose();
      resolve(env);
    }, undefined, () => resolve(null));
  });
  envCache.set(renderer, p);
  return p;
}

export const SFX_FILES = {
  bounce: ['bounce1', 'bounce2', 'bounce3'], rim: ['rim1', 'rim2'], board: ['board'], dunk: ['dunk'],
  swish: ['swish1', 'swish2'], squeak: ['squeak'], cheer: ['cheer'], ooh: ['ooh'], crowd: ['crowd_loop'],
};
