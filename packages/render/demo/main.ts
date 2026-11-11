import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { golden, resolve } from '@opensu/model';
import { buildHouse } from '@opensu/kernel';
import { createHouseObject, IllustrationViewer, type SceneStats } from '../src/index.js';
import { VIEWS } from './views.js';

declare global {
  interface Window {
    __shotReady?: boolean;
    __stats?: SceneStats;
  }
}

const params = new URLSearchParams(location.search);
const shot = params.has('shot');
if (shot) document.body.classList.add('shot');

const app = document.getElementById('app')!;
const viewer = new IllustrationViewer(app, { pixelRatio: shot ? 1 : undefined, preserveDrawingBuffer: shot });
const statsEl = document.getElementById('stats')!;
viewer.onAfterRender = (s) => {
  statsEl.textContent = `${s.triangles.toLocaleString()} triangles, ${s.drawCalls} draw calls (${s.drawCallsWithShadows} incl. shadow pass)`;
};

// Golden sample: model -> kernel -> render.
const t0 = performance.now();
const geometry = buildHouse(resolve(golden));
const t1 = performance.now();
const house = createHouseObject(geometry, viewer.palette);
viewer.setContent(house.root, house.framePoints);
console.log(`[openSU] kernel ${(t1 - t0).toFixed(0)} ms, ${geometry.parts.length} parts, ${geometry.stats.triangles} kernel triangles, ${geometry.stats.edges} edges`);
// Debug switches: ?hide=floor-lines,feature-edges
for (const name of (params.get('hide') ?? '').split(',').filter(Boolean)) {
  const o = viewer.scene.getObjectByName(name);
  if (o) o.visible = false;
}
const initial = VIEWS.find((v) => v.id === params.get('view')) ?? VIEWS[0]!;

let controls: OrbitControls | null = null;
function applyView(id: string): void {
  const preset = VIEWS.find((v) => v.id === id)!;
  viewer.setView(preset);
  controls?.dispose();
  if (!shot) {
    controls = new OrbitControls(viewer.camera, viewer.renderer.domElement);
    controls.target.copy(viewer.focusPoint());
    controls.update();
    controls.addEventListener('change', () => viewer.requestRender());
  }
  for (const b of document.querySelectorAll('#ui button')) b.classList.toggle('on', (b as HTMLElement).dataset.id === id);
}

const ui = document.getElementById('ui')!;
for (const v of VIEWS) {
  const btn = document.createElement('button');
  btn.textContent = v.label;
  btn.dataset.id = v.id;
  btn.onclick = () => applyView(v.id);
  ui.appendChild(btn);
}

window.addEventListener('resize', () => viewer.resize());
applyView(initial.id);

const stats = viewer.renderNow();
console.log(`[openSU] ${stats.triangles} triangles, ${stats.drawCalls} draw calls (${stats.drawCallsWithShadows} incl. shadow pass)`);
window.__stats = stats;
(window as unknown as { __viewer: IllustrationViewer }).__viewer = viewer;
window.__shotReady = true;
