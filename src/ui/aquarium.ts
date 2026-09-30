import type { Bacterium } from '../sim/entities';
import { World } from '../sim/world';
import { cloneGenome } from '../sim/genome';
import { isolatedSystems } from '../sim/systems';
import { makePatches, makeZones } from '../sim/env';
import { TYPES, classify } from '../sim/behavior';
import { Renderer } from './renderer';
import { Inspector } from './inspector';

const W = 560;
const H = 380;

/**
 * Аквариум: одна бактерия (копия выбранной) в маленьком отдельном мире.
 * Без конкурентов и размножения — видно, как именно она ищет еду.
 */
export function openAquarium(src: Bacterium, srcWorld: World): void {
  document.querySelector('.modal.aquarium')?.remove();
  const m = document.createElement('div');
  m.className = 'modal aquarium';
  const type = TYPES[src.type];
  m.innerHTML = `<div class="modal-box wide">
    <header><h2>🔬 Аквариум: #${src.id} <small style="color:${type.color}">${src.strategy}</small></h2><button class="icon" data-a="close">✕</button></header>
    <p class="hint">Копия бактерии с тем же мозгом и телом, одна в маленьком мире с теми же правилами (кусты, зоны, сезоны).
      Размножения нет. След показывает траекторию за последние ~90 шагов.</p>
    <div class="aq-controls">
      <button data-a="pause" class="primary">⏸ Пауза</button>
      <span class="seg"><button data-s="1">×1</button><button data-s="2" class="active">×2</button><button data-s="5">×5</button><button data-s="20">×20</button></span>
      <button data-a="restart">↻ Заново</button>
      <label class="check"><input type="checkbox" data-a="vision" checked/> зрение</label>
      <span class="aq-status"></span>
    </div>
    <div class="aq-body"><div class="aq-field"><canvas></canvas></div><div class="aq-insp"></div></div>
  </div>`;
  document.body.appendChild(m);

  const renderer = new Renderer(m.querySelector('canvas')!);
  const inspector = new Inspector(m.querySelector('.aq-insp')!, { aquarium: () => undefined, focusLineage: () => undefined, focusStrategy: () => undefined }, true);
  const status = m.querySelector<HTMLElement>('.aq-status')!;
  const vision = m.querySelector<HTMLInputElement>('[data-a=vision]')!;
  let speed = 2;
  let running = true;
  let world: World;
  let b: Bacterium;
  let alive = true;
  let closed = false;

  const build = () => {
    const area = (W * H) / (srcWorld.cfg.fieldW * srcWorld.cfg.fieldH);
    const cfg = {
      ...srcWorld.cfg,
      fieldW: W,
      fieldH: H,
      seed: Math.floor(Math.random() * 1e9),
      maxFood: Math.max(15, Math.round(srcWorld.cfg.maxFood * area * 1.3)),
      foodPerTick: srcWorld.cfg.foodPerTick * area * 1.3,
      patchCount: Math.max(1, Math.round(srcWorld.cfg.patchCount * area * 1.5)),
      zoneCount: Math.max(1, Math.round(srcWorld.cfg.zoneCount * area * 1.5)),
    };
    world = new World(cfg, isolatedSystems);
    world.time = srcWorld.time;
    world.patches = makePatches(cfg, world.rng);
    world.zones = makeZones(cfg, world.rng);
    world.seedFood(Math.floor(cfg.maxFood / 2));
    b = world.makeBacterium(cloneGenome(src.genome), W / 2, H / 2, 0, Math.min(src.energy + 40, world.maxEnergyOf(src)), undefined);
    b.maxAge = src.maxAge;
    b.age = 0;
    b.fp.set(src.fp);
    classify(b);
    world.bacteria.push(b);
    alive = true;
    renderer.clearTrails();
    renderer.userMoved = false;
    renderer.resize(W, H);
  };
  build();

  const close = () => {
    closed = true;
    m.remove();
  };
  m.addEventListener('click', (e) => {
    const el = e.target as HTMLElement;
    if (el === m) close();
    const a = el.dataset.a;
    if (a === 'close') close();
    if (a === 'pause') {
      running = !running;
      el.textContent = running ? '⏸ Пауза' : '▶ Пуск';
    }
    if (a === 'restart') build();
    if (el.dataset.s) {
      speed = Number(el.dataset.s);
      m.querySelectorAll('[data-s]').forEach((x) => x.classList.toggle('active', x === el));
    }
  });
  window.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') {
      close();
      window.removeEventListener('keydown', esc);
    }
  });

  let lastUi = 0;
  const frame = (now: number) => {
    if (closed) return;
    if (running && alive) {
      for (let i = 0; i < speed; i++) {
        world.tick();
        if (!world.bacteria.length) {
          alive = false;
          break;
        }
      }
    }
    renderer.draw(world, { color: 'type', vision: vision.checked, trails: true, selected: b, focus: null });
    if (now - lastUi > 200) {
      lastUi = now;
      classify(b);
      inspector.update(world, b, alive);
      status.textContent = alive
        ? `съедено ${b.eaten} · энергия ${b.energy.toFixed(0)} · возраст ${b.age}`
        : `погибла (${b.energy <= 0 ? 'голод' : 'старость'}) · съедено ${b.eaten} — нажмите «Заново»`;
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
