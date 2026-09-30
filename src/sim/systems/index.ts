import type { World } from '../world';
import { type Bacterium, Food } from '../entities';
import { inherit } from '../genome';
import { updateFingerprint } from '../behavior';
import { seasonFactor } from '../env';

/** Система — один шаг конвейера тика. Порядок задаёт world.systems. */
export interface System {
  name: string;
  run(w: World): void;
}

const TAU = Math.PI * 2;
export const wrapAngle = (a: number): number => {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
};

/** Сценарий: заранее запланированные изменения параметров. */
export const scenario: System = {
  name: 'scenario',
  run(w) {
    for (const s of w.scenario) {
      if (s.done || w.time < s.tick) continue;
      s.done = true;
      w.setConfig(s.key, s.value, 'scenario');
    }
  },
};

/** Кусты еды восстанавливаются и дрейфуют. */
export const environment: System = {
  name: 'environment',
  run(w) {
    const { patchRegen, patchDrift, fieldW, fieldH } = w.cfg;
    const m = Math.min(fieldW, fieldH) * 0.1;
    for (const p of w.patches) {
      p.health = Math.min(1, p.health + patchRegen * (1 - p.health));
      if (patchDrift <= 0) continue;
      p.dir += w.rng.gauss() * 0.08;
      if (p.x < m || p.x > fieldW - m || p.y < m || p.y > fieldH - m) p.dir = Math.atan2(fieldH / 2 - p.y, fieldW / 2 - p.x);
      p.x += Math.cos(p.dir) * patchDrift;
      p.y += Math.sin(p.dir) * patchDrift;
    }
  },
};

/** Возобновление еды: в кустах, по всему полю и в токсичных зонах. */
export const foodSpawn: System = {
  name: 'foodSpawn',
  run(w) {
    const c = w.cfg;
    const season = seasonFactor(c, w.time);
    w.foodAcc += c.foodPerTick * season;
    while (w.foodAcc >= 1) {
      w.foodAcc -= 1;
      if (w.foods.length >= c.maxFood) {
        w.foodAcc = 0;
        break;
      }
      spawnOneFood(w);
    }
    const toxic = w.zones.filter((z) => z.type === 1);
    if (!toxic.length || c.toxicFood <= 0) return;
    w.toxicAcc += c.foodPerTick * season * c.toxicFood;
    while (w.toxicAcc >= 1) {
      w.toxicAcc -= 1;
      if (w.foods.length >= c.maxFood) {
        w.toxicAcc = 0;
        break;
      }
      const z = toxic[w.rng.int(toxic.length)];
      const a = w.rng.range(0, TAU), d = Math.sqrt(w.rng.next()) * z.r;
      const x = z.x + Math.cos(a) * d, y = z.y + Math.sin(a) * d;
      if (x >= 0 && y >= 0 && x <= c.fieldW && y <= c.fieldH) w.addFood(new Food(x, y, c.foodEnergy));
    }
  },
};

/** Одна новая еда: в кусте (с вероятностью patchShare) или в случайном месте. */
export function spawnOneFood(w: World): void {
  const c = w.cfg;
  if (w.patches.length && w.rng.next() < c.patchShare) spawnInPatch(w);
  else w.addFood(new Food(w.rng.range(0, c.fieldW), w.rng.range(0, c.fieldH), c.foodEnergy));
}

/** Еда в кусте: чем сильнее куст объеден, тем чаще еда «уходит» в случайное место поля. */
function spawnInPatch(w: World): void {
  const c = w.cfg;
  const i = w.rng.int(w.patches.length);
  const p = w.patches[i];
  if (w.rng.next() > p.health) {
    w.addFood(new Food(w.rng.range(0, c.fieldW), w.rng.range(0, c.fieldH), c.foodEnergy));
    return;
  }
  const sd = c.patchRadius / 1.8;
  const x = Math.min(c.fieldW, Math.max(0, p.x + w.rng.gauss() * sd));
  const y = Math.min(c.fieldH, Math.max(0, p.y + w.rng.gauss() * sd));
  w.addFood(new Food(x, y, c.foodEnergy, i));
}

/** Быстрый atan2 (погрешность ~0.005 рад) — для секторов глаз этого достаточно. */
function fastAtan2(y: number, x: number): number {
  const ax = Math.abs(x), ay = Math.abs(y);
  const mx = Math.max(ax, ay);
  if (mx === 0) return 0;
  const a = Math.min(ax, ay) / mx;
  const s = a * a;
  let r = ((-0.0464964749 * s + 0.15931422) * s - 0.327622764) * s * a + a;
  if (ay > ax) r = 1.57079637 - r;
  if (x < 0) r = 3.14159274 - r;
  return y < 0 ? -r : r;
}

const cellBuf: unknown[][] = [];

/** Восприятие: ближайшая еда, еда и соседи по секторам, теснота, зона. */
export const sense: System = {
  name: 'sense',
  run(w) {
    const sectorMode = w.cfg.sensorMode === 1;
    const k = w.cfg.sectors;
    const width = TAU / k;
    const half = width / 2 + TAU;
    w.peerGrid.rebuild(w.bacteria);
    const fcells = cellBuf as Food[][];
    const pcells = cellBuf as Bacterium[][];
    for (const b of w.bacteria) {
      const r = w.visionOf(b);
      const r2 = r * r;
      const inv = 1 / r;
      let best = r2;
      let bf: Food | null = null;
      let count = 0;
      const ca = Math.cos(b.angle), sa = Math.sin(b.angle);
      const sF = b.sFood, sP = b.sPeer;
      if (sectorMode) {
        sF.fill(0);
        sP.fill(0);
      }
      const bx = b.x, by = b.y;
      let nc = w.foodGrid.cellsNear(bx, by, r, fcells);
      for (let c = 0; c < nc; c++) {
        const arr = fcells[c];
        for (let q = 0; q < arr.length; q++) {
          const f = arr[q];
          const dx = f.x - bx, dy = f.y - by;
          const d2 = dx * dx + dy * dy;
          if (d2 > r2) continue;
          count++;
          if (d2 < best) {
            best = d2;
            bf = f;
          }
          if (sectorMode) {
            const a = fastAtan2(dy * ca - dx * sa, dx * ca + dy * sa);
            sF[Math.floor((a + half) / width) % k] += 1 - Math.sqrt(d2) * inv;
          }
        }
      }
      b.foodCount = count;
      if (bf) {
        const dx = bf.x - bx, dy = bf.y - by;
        b.seesFood = true;
        b.foodDist = Math.sqrt(best);
        b.dAngle = wrapAngle(Math.atan2(dy, dx) - b.angle);
        b.foodX = bf.x;
        b.foodY = bf.y;
      } else {
        b.seesFood = false;
      }
      // соседи
      const near = w.radiusOf(b) * 2 + 20;
      const near2 = near * near;
      const pr = sectorMode ? Math.max(near, r * 0.5) : near;
      const pr2 = pr * pr;
      let crowd = 0;
      nc = w.peerGrid.cellsNear(bx, by, pr, pcells);
      for (let c = 0; c < nc; c++) {
        const arr = pcells[c];
        for (let q = 0; q < arr.length; q++) {
          const o = arr[q];
          if (o === b) continue;
          const dx = o.x - bx, dy = o.y - by;
          const d2 = dx * dx + dy * dy;
          if (d2 > pr2) continue;
          if (d2 < near2) crowd++;
          if (sectorMode) {
            const a = fastAtan2(dy * ca - dx * sa, dx * ca + dy * sa);
            sP[Math.floor((a + half) / width) % k] += 1 - Math.sqrt(d2) / pr;
          }
        }
      }
      b.crowd = crowd;
      if (sectorMode) {
        for (let i = 0; i < k; i++) {
          sF[i] = 1 - Math.exp(-1.5 * sF[i]);
          sP[i] = 1 - Math.exp(-1.5 * sP[i]);
        }
      }
      // зона
      b.zone = -1;
      for (const z of w.zones) {
        if ((bx - z.x) ** 2 + (by - z.y) ** 2 < z.r * z.r) {
          b.zone = z.type;
          break;
        }
      }
    }
  },
};

/** Мозг: сенсоры → сеть → действия. */
export const think: System = {
  name: 'think',
  run(w) {
    const acc = w.acc;
    for (const b of w.bacteria) {
      for (let i = 0; i < w.sensors.length; i++) w.sensors[i].fill(b, w, b.inputs, w.inputOffsets[i]);
      b.genome.brain.forward(b.inputs, b.outputs);
      const a0 = b.angle;
      for (let i = 0; i < w.actuators.length; i++) w.actuators[i].apply(b, b.outputs[i], w);
      if (b.seesFood) {
        // насколько взгляд (а значит и движение) направлен на еду
        acc.dirSum += Math.cos(b.dAngle - (b.angle - a0));
        acc.dirN++;
      }
      acc.thrustSum += b.thrust;
      acc.thrustN++;
    }
  },
};

/** Движение вдоль взгляда; стены останавливают; бактерии расталкивают друг друга. */
export const move: System = {
  name: 'move',
  run(w) {
    const { fieldW, fieldH } = w.cfg;
    for (const b of w.bacteria) {
      const R = w.radiusOf(b);
      const v = b.thrust * w.maxSpeedOf(b);
      b.speedNow = v;
      b.x = Math.min(fieldW - R, Math.max(R, b.x + Math.cos(b.angle) * v));
      b.y = Math.min(fieldH - R, Math.max(R, b.y + Math.sin(b.angle) * v));
    }
    if (!w.cfg.collisions) return;
    const maxR = w.cfg.radius * 2.5;
    for (const b of w.bacteria) {
      const rb = w.radiusOf(b);
      w.peerGrid.forEachNear(b.x, b.y, rb + maxR, (o) => {
        if (o.id <= b.id) return;
        const dx = o.x - b.x, dy = o.y - b.y;
        const min = rb + w.radiusOf(o);
        const d2 = dx * dx + dy * dy;
        if (d2 >= min * min || d2 === 0) return;
        const d = Math.sqrt(d2);
        const push = (min - d) / 2 / d;
        b.x -= dx * push;
        b.y -= dy * push;
        o.x += dx * push;
        o.y += dy * push;
      });
    }
    for (const b of w.bacteria) {
      const R = w.radiusOf(b);
      b.x = Math.min(fieldW - R, Math.max(R, b.x));
      b.y = Math.min(fieldH - R, Math.max(R, b.y));
    }
  },
};

/** Поедание еды при касании. */
export const eat: System = {
  name: 'eat',
  run(w) {
    const { foodRadius, patchDeplete } = w.cfg;
    for (const b of w.bacteria) {
      const f = w.foodGrid.nearest(b.x, b.y, w.radiusOf(b) + foodRadius);
      if (!f) continue;
      w.removeFood(f);
      if (f.patch >= 0 && w.patches[f.patch]) {
        const p = w.patches[f.patch];
        p.health = Math.max(0.05, p.health - patchDeplete);
      }
      b.energy = Math.min(w.maxEnergyOf(b), b.energy + f.e);
      b.eaten++;
      b.eatenSince++;
      w.totals.eaten++;
      w.acc.eaten++;
      if (w.events.has('ate')) w.events.emit('ate', { b });
    }
  },
};

/** Расход энергии на жизнь и движение, старение. */
export const metabolism: System = {
  name: 'metabolism',
  run(w) {
    for (const b of w.bacteria) {
      b.energy -= w.upkeepOf(b) + w.moveCostOf(b);
      b.age++;
    }
  },
};

/** Обновление поведенческого отпечатка. */
export const behavior: System = {
  name: 'behavior',
  run(w) {
    const { fieldW, fieldH, maxSpeed } = w.cfg;
    for (const b of w.bacteria) {
      const dWall = Math.min(b.x, b.y, fieldW - b.x, fieldH - b.y);
      updateFingerprint(b, b.speedNow / maxSpeed, Math.abs(b.turn), 1 - Math.min(dWall, 80) / 80);
    }
  },
};

/** Деление: съедено достаточно (черта «еды до деления») и хватает энергии. */
export const reproduce: System = {
  name: 'reproduce',
  run(w) {
    const { divideEnergy, divideCost, maxPop, fieldW, fieldH } = w.cfg;
    const born: Bacterium[] = [];
    for (const b of w.bacteria) {
      const t = b.genome.traits;
      if (b.eatenSince < Math.max(1, Math.round(t.divFood)) || b.energy < divideEnergy) continue;
      if (w.bacteria.length + born.length >= maxPop) break;
      const e = b.energy;
      b.energy = e * (1 - t.childShare);
      b.eatenSince = 0;
      b.children++;
      const R = w.radiusOf(b);
      const ang = w.rng.range(0, TAU);
      const x = Math.min(fieldW - R, Math.max(R, b.x + Math.cos(ang) * R * 2));
      const y = Math.min(fieldH - R, Math.max(R, b.y + Math.sin(ang) * R * 2));
      const child = w.makeBacterium(inherit(b.genome, w.cfg, w.rng), x, y, w.rng.range(0, TAU), e * t.childShare * (1 - divideCost), b);
      born.push(child);
    }
    for (const c of born) {
      w.bacteria.push(c);
      w.totals.births++;
      w.acc.births++;
      if (c.generation > w.totals.maxGen) w.totals.maxGen = c.generation;
      if (w.events.has('born')) w.events.emit('born', { child: c });
    }
  },
};

/** Смерть от голода и от старости; труп становится едой. */
export const death: System = {
  name: 'death',
  run(w) {
    let alive = 0;
    const list = w.bacteria;
    const corpse = w.cfg.corpseEnergy;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      const hunger = b.energy <= 0;
      if (hunger || b.age >= b.maxAge) {
        if (hunger) {
          w.totals.deathsHunger++;
          w.acc.deathsHunger++;
        } else {
          w.totals.deathsAge++;
          w.acc.deathsAge++;
        }
        w.acc.lifeSum += b.age;
        w.acc.lifeN++;
        if (corpse > 0) w.addFood(new Food(b.x, b.y, corpse * b.genome.traits.size));
        if (w.events.has('died')) w.events.emit('died', { b, cause: hunger ? 'hunger' : 'age' });
      } else {
        list[alive++] = b;
      }
    }
    list.length = alive;
  },
};

/** Песочница — подсев случайных; выживание — фиксация вымирания. */
export const survival: System = {
  name: 'survival',
  run(w) {
    if (w.cfg.reseed) {
      const n = w.cfg.minPop - w.bacteria.length;
      if (n <= 0) return;
      for (let i = 0; i < n; i++) w.spawnRandom();
      w.totals.reseeds++;
      w.acc.reseeds++;
      if (w.events.has('reseeded')) w.events.emit('reseeded', { count: n });
      return;
    }
    if (w.bacteria.length === 0 && w.extinctAt < 0) {
      w.extinctAt = w.time;
      w.events.emit('extinct', { tick: w.time });
    }
  },
};

export const defaultSystems: System[] = [
  scenario, environment, foodSpawn, sense, think, move, eat, metabolism, behavior, reproduce, death, survival,
];

/** Системы для изолированных миров (аквариум, экзамен): без размножения, подсева и сценария. */
export const isolatedSystems: System[] = defaultSystems.filter((s) => !['scenario', 'reproduce', 'survival'].includes(s.name));
