import './style.css';
import { type Config, PRESETS, presetConfig } from '../core/config';
import { Simulation } from '../sim/simulation';
import type { Bacterium } from '../sim/entities';
import { TYPES } from '../sim/behavior';
import { ZONE_TYPES, seasonFactor, seasonName } from '../sim/env';
import { buildSummary } from '../stats/report';
import { autosave, clearAutosave, deserialize, download, loadAutosave, saveRun, serialize } from '../storage/save';
import { ChartPanel } from './charts';
import { HeatPanel } from './heatmaps';
import { Inspector } from './inspector';
import { type ColorMode, type Focus, Renderer } from './renderer';
import { SettingsPanel } from './settings';
import { StrategyPanel } from './strategies';
import { TimeWindow } from './timewindow';
import { RunsPanel, showReport } from './runs';
import { openAquarium } from './aquarium';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

async function main(): Promise<void> {
  // ---------- состояние ----------
  const saved = await loadAutosave();
  let sim: Simulation = saved?.sim ?? Simulation.create(presetConfig('normal'));
  let preset = saved?.preset ?? 'normal';
  let running = true;
  type Speed = 1 | 2 | 5 | 20 | 100 | 'max';
  let speed: Speed = 2;
  let selected: Bacterium | null = null;
  let focus: Focus = null;
  let tab = 'stats';
  let reported = sim.ended;
  let unsubs: (() => void)[] = [];

  const win = new TimeWindow();
  const renderer = new Renderer($('canvas'));
  const charts = new ChartPanel($('tab-charts'), win);
  const heat = new HeatPanel($('tab-heat'), win);
  const aquarium = (b: Bacterium) => openAquarium(b, sim.world);
  const strategies = new StrategyPanel($('tab-strategies'), win, {
    focus: (f) => setFocus(f),
    show: (b) => {
      select(b);
      renderer.centerOn(b.x, b.y);
    },
    aquarium,
  });
  const inspector = new Inspector($('tab-inspector'), {
    aquarium,
    focusLineage: (id) => setFocus({ kind: 'lineage', id }),
    focusStrategy: (name) => setFocus({ kind: 'strategy', name }),
  });
  const settings = new SettingsPanel($('tab-settings'), {
    getWorld: () => sim.world,
    setLive: (k, v) => sim.world.setConfig(k, v),
    restart: (cfg, p) => newSim(cfg, p),
  });
  const runs = new RunsPanel($('tab-runs'));
  runs.onRepeat = (s) => newSim({ ...sim.world.cfg, seed: s.seed }, s.preset);
  runs.onNew = (s) => newSim({ ...sim.world.cfg, seed: Math.floor(Math.random() * 4294967295) }, s.preset);

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
    running = v && !sim.ended;
    playBtn.textContent = running ? '⏸ Пауза' : '▶ Пуск';
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
  $('btn-end').addEventListener('click', () => endRun('manual'));
  window.addEventListener('keydown', (e) => {
    const t = e.target;
    if (t instanceof HTMLInputElement || t instanceof HTMLSelectElement || document.querySelector('.modal')) return;
    if (e.code === 'Space') {
      e.preventDefault();
      setRunning(!running);
    }
    if (e.key === 'Escape' && focus) setFocus(null);
  });

  const colorSel = $<HTMLSelectElement>('color-mode');
  const visionChk = $<HTMLInputElement>('opt-vision');
  const trailsChk = $<HTMLInputElement>('opt-trails');
  const followChk = $<HTMLInputElement>('opt-follow');

  // ---------- сохранение ----------
  $('btn-save').addEventListener('click', () => {
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    download(`bacteria-tick${sim.world.time}-${stamp}.json`, serialize(sim, preset));
  });
  $('btn-csv').addEventListener('click', () => download('bacteria-stats.csv', sim.recorder.toCSV(), 'text/csv'));
  const fileInput = $<HTMLInputElement>('file-load');
  $('btn-load').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const f = fileInput.files?.[0];
    fileInput.value = '';
    if (!f) return;
    try {
      const r = deserialize(await f.text());
      replaceSim(r.sim, r.preset);
    } catch (e) {
      alert(`Не удалось загрузить: ${(e as Error).message}`);
    }
  });

  function bindSim(): void {
    unsubs.forEach((f) => f());
    unsubs = [
      sim.world.events.on('configChanged', (e) => {
        if (e.source === 'scenario') settings.syncLive(e.key, e.value);
        settings.renderScenario();
      }),
    ];
  }

  function replaceSim(s: Simulation, p: string): void {
    sim = s;
    preset = p;
    selected = null;
    reported = sim.ended;
    setFocus(null);
    bindSim();
    settings.sync(p);
    renderer.userMoved = false;
    renderer.clearTrails();
    renderer.resize(sim.world.cfg.fieldW, sim.world.cfg.fieldH);
    setRunning(!sim.ended);
    refresh(true);
  }

  function newSim(cfg: Config, p: string): void {
    void clearAutosave();
    replaceSim(Simulation.create(cfg), p);
    const label = PRESETS.find((x) => x.id === p)?.label ?? p;
    sim.recorder.log('info', `Новый запуск: пресет «${label}», seed ${cfg.seed}`);
  }

  function endRun(reason: 'extinct' | 'manual'): void {
    setRunning(false);
    if (reason === 'extinct') reported = true;
    const s = buildSummary(sim, reason, preset);
    saveRun(s);
    if (tab === 'runs') runs.render();
    showReport(s, {
      repeat: () => newSim({ ...sim.world.cfg, seed: s.seed }, preset),
      newSeed: () => newSim({ ...sim.world.cfg, seed: Math.floor(Math.random() * 4294967295) }, preset),
      close: () => refresh(true),
    });
  }

  // ---------- фокус и выбор ----------
  function setFocus(f: Focus): void {
    focus = f;
    strategies.setFocus(f);
    renderer.clearTrails();
    renderLegend(true);
    if (tab === 'strategies') strategies.update(sim, true);
    drawNow();
  }

  function select(b: Bacterium | null): void {
    selected = b;
    if (b) showTab('inspector');
    refresh(true);
  }

  // ---------- вкладки ----------
  const tabBtns = document.querySelectorAll<HTMLButtonElement>('#tabs button');
  tabBtns.forEach((b) =>
    b.addEventListener('click', () => {
      tab = b.dataset.tab!;
      tabBtns.forEach((x) => x.classList.toggle('active', x === b));
      document.querySelectorAll<HTMLElement>('.tab-body').forEach((el) => (el.hidden = el.id !== `tab-${tab}`));
      if (tab === 'charts') charts.layout();
      if (tab === 'runs') runs.render();
      if (tab === 'settings') settings.renderScenario();
      refresh(true);
    }),
  );
  function showTab(name: string): void {
    if (tab !== name) tabBtns.forEach((b) => b.dataset.tab === name && b.click());
  }

  // ---------- легенда на поле ----------
  const legend = $('legend');
  legend.addEventListener('click', (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-type],[data-clear]');
    if (!el) return;
    if (el.dataset.clear !== undefined) return setFocus(null);
    const idx = Number(el.dataset.type);
    setFocus(focus?.kind === 'type' && focus.idx === idx ? null : { kind: 'type', idx });
  });
  function renderLegend(force = false): void {
    // пока мышь над легендой, не перестраиваем её — иначе клик может «потеряться»
    if (!force && legend.matches(':hover')) return;
    const n = sim.world.bacteria.length || 1;
    const counts = TYPES.map(() => 0);
    for (const b of sim.world.bacteria) counts[b.type]++;
    const byType = colorSel.value === 'type';
    let html = byType
      ? TYPES.map((t, i) => {
          const active = focus?.kind === 'type' && focus.idx === i;
          return `<button data-type="${i}" class="${active ? 'active' : ''}" title="${t.hint}. Клик — показать только их"><i style="background:${t.color}"></i>${t.name}<b>${Math.round((counts[i] / n) * 100)}%</b></button>`;
        }).join('')
      : '';
    if (focus) {
      const what = focus.kind === 'type' ? TYPES[focus.idx].name : focus.kind === 'strategy' ? focus.name : `семья №${focus.id}`;
      html += `<button data-clear class="focus-off">Фокус: ${what} ✕</button>`;
    }
    if (sim.world.zones.length) {
      html += `<div class="zones-legend">${ZONE_TYPES.map((z) => `<span title="${z.hint}"><i style="border-color:${z.stroke};background:${z.fill}"></i>${z.name}</span>`).join('')}</div>`;
    }
    legend.innerHTML = html;
  }
  colorSel.addEventListener('change', () => {
    renderLegend(true);
    drawNow();
  });

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
      select(renderer.pick(sim.world, e.clientX - r.left, e.clientY - r.top));
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
    drawNow();
  }).observe($('field'));
  new ResizeObserver(() => {
    if (tab === 'charts') charts.layout();
    if (tab === 'heat') heat.draw();
    if (tab === 'strategies') strategies.redraw();
  }).observe(document.querySelector('.side')!);

  // ---------- отрисовка интерфейса ----------
  function drawNow(): void {
    renderer.draw(sim.world, {
      color: colorSel.value as ColorMode,
      vision: visionChk.checked,
      trails: trailsChk.checked,
      selected,
      focus,
    });
  }

  const num = (v: number, d = 0) => (Number.isFinite(v) ? v.toLocaleString('ru-RU', { maximumFractionDigits: d, minimumFractionDigits: d }) : '—');
  let tpsShown = 0;

  function renderStats(): void {
    const w = sim.world;
    const h = sim.recorder.history;
    const last = (id: string) => h.last(id);
    const { alive } = sim.recorder.lineageStats();
    const season = seasonName(w.cfg, w.time);
    const top = sim.recorder.currentStrategies()[0];
    const cards: [string, string][] = [
      ['Тик (цикл)', num(w.time)],
      ['Скорость, тиков/с', num(tpsShown)],
      ['Популяция', num(w.bacteria.length)],
      ['Еды на поле', num(w.foods.length)],
      ['Время года', season ? `${season} (еда ×${seasonFactor(w.cfg, w.time).toFixed(2)})` : 'без сезонов'],
      ['Режим', w.cfg.reseed ? 'песочница' : 'выживание'],
      ['Рождений всего', num(w.totals.births)],
      ['Съедено всего', num(w.totals.eaten)],
      ['Смертей от голода', num(w.totals.deathsHunger)],
      ['Смертей от старости', num(w.totals.deathsAge)],
      ['Макс. поколение', num(w.totals.maxGen)],
      ['Среднее поколение', num(last('avgGen'), 1)],
      ['Живых семей', num(alive)],
      ['Заметных стратегий', num(last('strategies'))],
      ['Направленность', num(last('directionality'), 2)],
      ['Еды/бактерию/1000', num(last('efficiency'), 2)],
    ];
    if (w.cfg.reseed) cards.push(['Подсевов', num(w.totals.reseeds)]);
    const epoch = sim.recorder.chronicle.current;
    $('tab-stats').innerHTML =
      (w.extinct ? `<div class="banner bad">☠ Популяция вымерла на тике ${num(w.extinctAt)}. Новый запуск — во вкладке «Настройки» или в отчёте.</div>` : '') +
      `<div class="cards">${cards.map(([k, v]) => `<div class="card"><span>${k}</span><b>${v}</b></div>`).join('')}</div>` +
      (top ? `<p class="hint">Самая массовая стратегия: <b style="color:${TYPES[top.type]?.color}">${top.name}</b> — ${Math.round(top.share * 100)} %.</p>` : '') +
      (epoch ? `<p class="hint">Идёт эпоха ${epoch.n}: преобладают «${TYPES[epoch.type].name}» с тика ${num(epoch.start)}. Подробно — во вкладке «Хроника».</p>` : '') +
      `<p class="hint">Направленность: ≈0 — бактерии движутся без цели, →1 — едут прямо к еде. Цвета на поле — типы поведения (легенда слева вверху, клик — фокус).</p>`;
  }

  let chronicleKey = '';
  function renderChronicle(): void {
    const r = sim.recorder;
    const j = r.journal;
    const key = `${r.chronicle.epochs.length}:${sim.world.time >> 9}:${j.length}:${j[j.length - 1]?.text}`;
    if (key === chronicleKey) return;
    chronicleKey = key;
    const epochs = r.chronicle.render(sim.world.time).reverse();
    $('tab-chronicle').innerHTML =
      `<p class="hint">Запуск делится на эпохи по смене преобладающего типа поведения. Текст собирается автоматически из цифр и событий.</p>` +
      `<div class="chronicle">${
        epochs.length
          ? epochs.map((e) => `<article style="border-color:${TYPES[e.type].color}"><h4>${e.title}</h4>${e.body.map((p) => `<p>${p}</p>`).join('')}</article>`).join('')
          : '<p class="hint">Хроника начнётся после первых замеров.</p>'
      }</div>` +
      `<h3 class="group-title">Журнал событий</h3>` +
      (j.length
        ? [...j].reverse().map((e) => `<div class="journal-row ${e.kind}"><time>${num(e.tick)}</time><span>${e.text}</span></div>`).join('')
        : '<p class="hint">Пока событий нет.</p>');
  }

  function updateTab(force = false): void {
    if (tab === 'stats') renderStats();
    if (tab === 'charts') charts.update(sim.recorder.history, sim.recorder.markers);
    if (tab === 'heat') heat.update(sim.recorder.heat, sim.recorder.history);
    if (tab === 'strategies') strategies.update(sim);
    if (tab === 'chronicle') renderChronicle();
    if (tab === 'inspector' || force) inspector.update(sim.world, selected, !!selected && sim.world.bacteria.includes(selected));
    renderLegend();
    const w = sim.world;
    const season = seasonName(w.cfg, w.time);
    $('hud').textContent = `тик ${num(w.time)}${season ? ` · ${season}` : ''} · масштаб ${Math.round(renderer.scale * 100)}% · колесо — зум, перетаскивание — сдвиг, клик — выбрать`;
  }

  function refresh(force = false): void {
    drawNow();
    updateTab(force);
  }

  // ---------- главный цикл ----------
  let lastUi = 0;
  let lastDraw = 0;
  let tpsBase = sim.world.time;
  let tpsStamp = performance.now();
  let lastAutosave = performance.now();

  function frame(now: number): void {
    if (running) {
      const t0 = performance.now();
      if (speed === 'max') {
        while (performance.now() - t0 < 30 && !sim.ended) sim.run(10);
      } else {
        for (let i = 0; i < speed && performance.now() - t0 < 40; i++) sim.step();
      }
    }
    if (sim.ended && !reported) endRun('extinct');
    const t = performance.now();
    if (t - tpsStamp >= 500) {
      tpsShown = ((sim.world.time - tpsBase) / (t - tpsStamp)) * 1000;
      tpsBase = sim.world.time;
      tpsStamp = t;
    }
    // в режиме «макс» поле рисуется реже, чтобы не тратить время
    const drawEvery = speed === 'max' && running ? 250 : 0;
    if (now - lastDraw >= drawEvery) {
      if (followChk.checked && selected && sim.world.bacteria.includes(selected)) renderer.centerOn(selected.x, selected.y);
      drawNow();
      lastDraw = now;
    }
    if (now - lastUi >= 300) {
      lastUi = now;
      updateTab();
    }
    if (t - lastAutosave > 30000) {
      lastAutosave = t;
      void autosave(sim, preset);
    }
    requestAnimationFrame(frame);
  }

  window.addEventListener('beforeunload', () => void autosave(sim, preset));
  document.addEventListener('visibilitychange', () => document.hidden && void autosave(sim, preset));
  bindSim();
  renderer.resize(sim.world.cfg.fieldW, sim.world.cfg.fieldH);
  settings.sync(preset);
  setRunning(!sim.ended);
  refresh(true);
  requestAnimationFrame(frame);
}

void main();
