import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { golden, resolve } from '@opensu/model';
import { buildHouse } from '@opensu/kernel';
import { createHouseObject, datePresets, IllustrationViewer, type SceneStats } from '../src/index.js';
import { VIEWS } from './views.js';

declare global {
  interface Window {
    __shotReady?: boolean;
    __stats?: SceneStats;
    __measureShadows?: (frames?: number) => { withShadows: number; withoutShadows: number };
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

// ---- sun study state: ?sun=winter|spring|summer|autumn|today|YYYY-MM-DD&time=HH:MM&year=2026
const year = Number(params.get('year') ?? new Date().getFullYear());
const presets = datePresets(year);
const sunParam = params.get('sun');
let date = presets.find((p) => p.id === sunParam)?.date ?? (sunParam && /^\d{4}-\d{2}-\d{2}$/.test(sunParam) ? sunParam : presets[0]!.date);
const timeParam = /^(\d{1,2}):(\d{2})$/.exec(params.get('time') ?? '');
let minutes = timeParam ? Number(timeParam[1]) * 60 + Number(timeParam[2]) : 15 * 60;
let physical = !!sunParam;

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.round(m % 60)).padStart(2, '0')}`;
const slider = document.getElementById('time') as HTMLInputElement;
const timeLabel = document.getElementById('time-label')!;
const sunEl = document.getElementById('sun')!;

function applyLighting(): void {
  if (!physical) {
    viewer.setLighting({ mode: 'presentation' });
    sunEl.classList.remove('physical');
    timeLabel.textContent = 'presentation light';
    return;
  }
  viewer.setLighting({ mode: 'physical', date, minutes });
  const s = viewer.sunStudy!;
  minutes = s.minutes;
  slider.min = String(Math.ceil(s.times.sunrise ?? 0));
  slider.max = String(Math.floor(s.times.sunset ?? 1439));
  slider.value = String(minutes);
  sunEl.classList.add('physical');
  timeLabel.textContent = `${date} ${hhmm(minutes)}  sun ${s.trueAzimuthDeg.toFixed(0)}° / ${s.trueElevationDeg.toFixed(0)}°`;
  for (const b of document.querySelectorAll('#dates button')) b.classList.toggle('on', (b as HTMLElement).dataset.date === date);
}

slider.addEventListener('input', () => {
  minutes = Number(slider.value);
  physical = true;
  applyLighting();
});
const datesEl = document.getElementById('dates')!;
const presentationBtn = document.createElement('button');
presentationBtn.textContent = 'Presentation';
presentationBtn.onclick = () => {
  physical = false;
  applyLighting();
};
datesEl.appendChild(presentationBtn);
for (const p of presets) {
  const b = document.createElement('button');
  b.textContent = p.label;
  b.dataset.date = p.date;
  b.onclick = () => {
    date = p.date;
    physical = true;
    applyLighting();
  };
  datesEl.appendChild(b);
}

// ---- cutaway: ?cut=L1 (or from a cutaway view)
const cutsEl = document.getElementById('cuts')!;
function applyCut(levelId: string | null): void {
  viewer.setCutaway(levelId);
  for (const b of cutsEl.querySelectorAll('button')) b.classList.toggle('on', ((b as HTMLElement).dataset.level ?? null) === (levelId ?? 'none'));
}
for (const id of ['none', ...viewer.levelList.map((l) => l.id)]) {
  const b = document.createElement('button');
  b.textContent = id === 'none' ? 'Whole house' : `Cut ${id}`;
  b.dataset.level = id;
  b.onclick = () => {
    applyCut(id === 'none' ? null : id);
    resetControls();
  };
  cutsEl.appendChild(b);
}

// ---- views
const initial = VIEWS.find((v) => v.id === params.get('view')) ?? VIEWS[0]!;
let controls: OrbitControls | null = null;
function resetControls(): void {
  controls?.dispose();
  if (shot) return;
  // Read the focus first: OrbitControls' constructor calls update() with its
  // default target (the origin), which re-aims the camera.
  const focus = viewer.focusPoint();
  const quaternion = viewer.camera.quaternion.clone();
  controls = new OrbitControls(viewer.camera, viewer.renderer.domElement);
  viewer.camera.quaternion.copy(quaternion);
  viewer.camera.updateMatrixWorld();
  controls.target.copy(focus);
  controls.update();
  controls.addEventListener('change', () => viewer.requestRender());
}
function applyView(id: string): void {
  const preset = VIEWS.find((v) => v.id === id)!;
  const cut = params.get('cut') ?? preset.cutaway ?? null;
  params.delete('cut');
  applyCut(cut === 'none' ? null : cut);
  viewer.setView(preset);
  resetControls();
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
applyLighting();

const stats = viewer.renderNow();
console.log(`[openSU] ${stats.triangles} triangles, ${stats.drawCalls} draw calls (${stats.drawCallsWithShadows} incl. shadow pass)`);
window.__stats = stats;
window.__measureShadows = (frames) => viewer.measureShadowUpdate(frames);
(window as unknown as { __viewer: IllustrationViewer }).__viewer = viewer;
window.__shotReady = true;
