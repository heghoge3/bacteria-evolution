import './style.css';
import { type Config, defaultConfig } from '../core/config';
import { Simulation } from '../sim/simulation';
import type { Bacterium } from '../sim/entities';
import { METRICS } from '../stats/metrics';
import { autosave, clearAutosave, deserialize, download, loadAutosave, serialize } from '../storage/save';
import { ChartPanel } from './charts';
import { Inspector } from './inspector';
import { type ColorMode, Renderer } from './renderer';
import { SettingsPanel } from './settings';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

// ---------- состояние ----------
let sim: Simulation = loadAutosave() ?? Simulation.create(defaultConfig());
let running = true;
type Speed = 1 | 2 | 5 | 20 | 100 | 'max';
let speed: Speed = 5;
let selected: Bacterium | null = null;
let tab = 'stats';

const renderer = new Renderer($('canvas'));
const charts = new ChartPanel($('tab-charts'));
const inspector = new Inspector($('tab-inspector'));
const settings = new SettingsPanel(
  $('tab-settings'),
  () => sim.world.cfg,
  (k, v) => sim.world.setConfig(k, v),
  (cfg) => newSim(cfg),
);

// ---------- панель управления ----------
const speeds: Speed[] = [1, 2, 5, 20, 100, 'max'];
const speedGroup = $('speed-group');
for (const s of speeds) {
  const b = document.createElement('button');
  b.textContent = s === 'max' ? 'макс' : `×${s}`;
  b.dataset.speed = String(s);
  b.addEventListener('click', () => setSpeed(s));
  speedGroup.appendChild(b);
}
function setSpeed(s: Speed): void {
  speed = s;
  speedGroup.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.speed === String(s)));
}
setSpeed(speed);

const playBtn = $('btn-play');
function setRunning(v: boolean): void {
  running = v;
  playBtn.textContent = v ? '⏸ Пауза' : '▶ Пуск';
}
playBtn.addEventListener('click', () => setRunning(!running));
$('btn-step').addEventListener('click', () => {
  setRunning(false);
  sim.step();
  refresh(true);
});
$('btn-fit').addEventListener('click', () => {
  renderer.fit(sim.world.cfg.fieldW, sim.world.cfg.fieldH);
  drawNow();
});
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLSelectElement)) {
    e.preventDefault();
    setRunning(!running);
  }
});

const colorSel = $<HTMLSelectElement>('color-mode');
const visionChk = $<HTMLInputElement>('opt-vision');
const followChk = $<HTMLInputElement>('opt-follow');

// ---------- сохранение ----------
$('btn-save').addEventListener('click', () => {
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  download(`bacteria-tick${sim.world.time}-${stamp}.json`, serialize(sim));
});
$('btn-csv').addEventListener('click', () => download('bacteria-stats.csv', sim.recorder.toCSV(), 'text/csv'));
const fileInput = $<HTMLInputElement>('file-load');
$('btn-load').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', async () => {
  const f = fileInput.files?.[0];
  fileInput.value = '';
  if (!f) return;
  try {
    replaceSim(deserialize(await f.text()));
  } catch (e) {
    alert(`Не удалось загрузить: ${(e as Error).message}`);
  }
});

function replaceSim(s: Simulation): void {
  sim = s;
  selected = null;
  settings.sync();
  renderer.userMoved = false;
  renderer.resize(sim.world.cfg.fieldW, sim.world.cfg.fieldH);
  refresh(true);
}

function newSim(cfg: Config): void {
  clearAutosave();
  replaceSim(Simulation.create(cfg));
  sim.recorder.log('info', `Новый запуск, seed ${cfg.seed}`);
}

// ---------- вкладки ----------
const tabBtns = document.querySelectorAll<HTMLButtonElement>('#tabs button');
tabBtns.forEach((b) =>
  b.addEventListener('click', () => {
    tab = b.dataset.tab!;
    tabBtns.forEach((x) => x.classList.toggle('active', x === b));
    document.querySelectorAll<HTMLElement>('.tab-body').forEach((el) => (el.hidden = el.id !== `tab-${tab}`));
    if (tab === 'charts') {
      charts.layout();
      charts.update(sim.recorder.history);
    }
    refresh(true);
  }),
);
function showTab(name: string): void {
  tabBtns.forEach((b) => b.dataset.tab === name && b.click());
}

// ---------- камера и мышь ----------
const canvas = renderer.canvas;
let drag: { x: number; y: number; moved: boolean } | null = null;
canvas.addEventListener('mousedown', (e) => (drag = { x: e.clientX, y: e.clientY, moved: false }));
window.addEventListener('mousemove', (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
  if (drag.moved) {
    renderer.panBy(dx, dy);
    drag.x = e.clientX;
    drag.y = e.clientY;
    drawNow();
  }
});
window.addEventListener('mouseup', (e) => {
  if (drag && !drag.moved && e.target === canvas) {
    const r = canvas.getBoundingClientRect();
    selected = renderer.pick(sim.world, e.clientX - r.left, e.clientY - r.top);
    if (selected) showTab('inspector');
    refresh(true);
  }
  drag = null;
});
canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    renderer.zoomAt(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.15 : 1 / 1.15);
    drawNow();
  },
  { passive: false },
);
new ResizeObserver(() => {
  renderer.resize(sim.world.cfg.fieldW, sim.world.cfg.fieldH);
  if (tab === 'charts') charts.layout();
  drawNow();
}).observe($('field'));

// ---------- отрисовка интерфейса ----------
function drawNow(): void {
  renderer.draw(sim.world, { color: colorSel.value as ColorMode, vision: visionChk.checked, selected });
}

const num = (v: number, d = 0) => v.toLocaleString('ru-RU', { maximumFractionDigits: d, minimumFractionDigits: d });
let tpsShown = 0;

function renderStats(): void {
  const w = sim.world;
  const h = sim.recorder.history;
  const last = (id: string) => h.data[id]?.[h.times.length - 1] ?? 0;
  const { alive } = sim.recorder.lineageStats();
  const avgGen = w.bacteria.length ? w.bacteria.reduce((s, b) => s + b.generation, 0) / w.bacteria.length : 0;
  const cards: [string, string][] = [
    ['Тик (цикл)', num(w.time)],
    ['Скорость, тиков/с', num(tpsShown)],
    ['Популяция', num(w.bacteria.length)],
    ['Еды на поле', num(w.foods.length)],
    ['Рождений всего', num(w.totals.births)],
    ['Съедено всего', num(w.totals.eaten)],
    ['Смертей от голода', num(w.totals.deathsHunger)],
    ['Смертей от старости', num(w.totals.deathsAge)],
    ['Макс. поколение', num(w.totals.maxGen)],
    ['Среднее поколение', num(avgGen, 1)],
    ['Живых семей', num(alive)],
    ['Подсевов', num(w.totals.reseeds)],
    ['Направленность', num(last('directionality'), 2)],
    ['Еды/бактерию/1000', num(last('efficiency'), 2)],
    ['Средняя энергия', num(last('avgEnergy'), 1)],
    ['Точек истории', `${num(h.times.length)} (шаг ${h.interval})`],
  ];
  $('tab-stats').innerHTML =
    `<div class="cards">${cards.map(([k, v]) => `<div class="card"><span>${k}</span><b>${v}</b></div>`).join('')}</div>` +
    `<p class="hint">Направленность: ≈0 — бактерии движутся случайно, →1 — едут прямо к еде. Именно этот показатель говорит, что популяция «поняла», что делать. Метрик в реестре: ${METRICS.length}.</p>`;
}

let journalKey = '';
function renderJournal(): void {
  const j = sim.recorder.journal;
  const key = `${j.length}:${j[j.length - 1]?.tick}:${j[j.length - 1]?.text}`;
  if (key === journalKey) return;
  journalKey = key;
  $('tab-journal').innerHTML = j.length
    ? [...j].reverse().map((e) => `<div class="journal-row ${e.kind}"><time>${num(e.tick)}</time><span>${e.text}</span></div>`).join('')
    : '<p class="hint">Пока событий нет.</p>';
}

function refresh(force = false): void {
  drawNow();
  if (force || tab === 'stats') renderStats();
  if (tab === 'charts') charts.update(sim.recorder.history);
  if (tab === 'journal') renderJournal();
  if (tab === 'inspector' || force) inspector.update(sim.world, selected, !!selected && sim.world.bacteria.includes(selected));
  $('hud').textContent = `масштаб ${Math.round(renderer.scale * 100)}%  ·  колесо — зум, перетаскивание — сдвиг`;
}

// ---------- главный цикл ----------
let lastUi = 0;
let lastDraw = 0;
let tpsBase = 0;
let tpsStamp = performance.now();
let lastAutosave = performance.now();

function frame(now: number): void {
  if (running) {
    const t0 = performance.now();
    if (speed === 'max') {
      while (performance.now() - t0 < 30) sim.run(20);
    } else {
      for (let i = 0; i < speed && performance.now() - t0 < 40; i++) sim.step();
    }
  }
  // счётчик скорости считаем по времени симуляции
  const t = performance.now();
  if (t - tpsStamp >= 500) {
    tpsShown = ((sim.world.time - tpsBase) / (t - tpsStamp)) * 1000;
    tpsBase = sim.world.time;
    tpsStamp = t;
  }
  // в режиме «макс» рисуем реже, чтобы не тратить время
  const drawEvery = speed === 'max' && running ? 250 : 0;
  if (now - lastDraw >= drawEvery) {
    if (followChk.checked && selected && sim.world.bacteria.includes(selected)) renderer.centerOn(selected.x, selected.y);
    drawNow();
    lastDraw = now;
  }
  if (now - lastUi >= 250) {
    lastUi = now;
    if (tab === 'stats') renderStats();
    if (tab === 'charts') charts.update(sim.recorder.history);
    if (tab === 'journal') renderJournal();
    if (tab === 'inspector') inspector.update(sim.world, selected, !!selected && sim.world.bacteria.includes(selected));
  }
  if (t - lastAutosave > 30000) {
    lastAutosave = t;
    autosave(sim);
  }
  requestAnimationFrame(frame);
}

window.addEventListener('beforeunload', () => autosave(sim));
renderer.resize(sim.world.cfg.fieldW, sim.world.cfg.fieldH);
settings.sync();
refresh(true);
requestAnimationFrame(frame);
