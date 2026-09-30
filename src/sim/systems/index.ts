import type { World } from '../world';
import { Bacterium, Food } from '../entities';
import { inherit, randomGenome } from '../genome';

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

/** Возобновление еды в случайных точках. */
export const foodSpawn: System = {
  name: 'foodSpawn',
  run(w) {
    w.foodAcc += w.cfg.foodPerTick;
    while (w.foodAcc >= 1) {
      w.foodAcc -= 1;
      if (w.foods.length >= w.cfg.maxFood) {
        w.foodAcc = 0;
        break;
      }
      w.addFood(new Food(w.rng.range(0, w.cfg.fieldW), w.rng.range(0, w.cfg.fieldH)));
    }
  },
};

/** Восприятие: ближайшая еда в радиусе зрения. */
export const sense: System = {
  name: 'sense',
  run(w) {
    const r = w.cfg.visionRadius;
    for (const b of w.bacteria) {
      const f = w.foodGrid.nearest(b.x, b.y, r);
      if (f) {
        const dx = f.x - b.x, dy = f.y - b.y;
        b.seesFood = true;
        b.foodDist = Math.hypot(dx, dy);
        b.dAngle = wrapAngle(Math.atan2(dy, dx) - b.angle);
        b.foodX = f.x;
        b.foodY = f.y;
      } else {
        b.seesFood = false;
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

/** Движение вдоль взгляда; стены останавливают. */
export const move: System = {
  name: 'move',
  run(w) {
    const { fieldW, fieldH, radius, maxSpeed } = w.cfg;
    for (const b of w.bacteria) {
      const v = b.thrust * maxSpeed;
      b.x = Math.min(fieldW - radius, Math.max(radius, b.x + Math.cos(b.angle) * v));
      b.y = Math.min(fieldH - radius, Math.max(radius, b.y + Math.sin(b.angle) * v));
    }
  },
};

/** Поедание еды при касании. */
export const eat: System = {
  name: 'eat',
  run(w) {
    const { radius, foodRadius, foodEnergy, maxEnergy } = w.cfg;
    const reach = radius + foodRadius;
    for (const b of w.bacteria) {
      const f = w.foodGrid.nearest(b.x, b.y, reach);
      if (!f) continue;
      w.removeFood(f);
      b.energy = Math.min(maxEnergy, b.energy + foodEnergy);
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
    const { metabolism: m, moveCost } = w.cfg;
    for (const b of w.bacteria) {
      b.energy -= m + moveCost * b.thrust * b.thrust;
      b.age++;
    }
  },
};

/** Деление: съедено достаточно и хватает энергии. */
export const reproduce: System = {
  name: 'reproduce',
  run(w) {
    const { divideFood, divideEnergy, maxPop, radius, fieldW, fieldH } = w.cfg;
    const born: Bacterium[] = [];
    for (const b of w.bacteria) {
      if (b.eatenSince < divideFood || b.energy < divideEnergy) continue;
      if (w.bacteria.length + born.length >= maxPop) break;
      b.energy /= 2;
      b.eatenSince = 0;
      b.children++;
      const ang = w.rng.range(0, TAU);
      const x = Math.min(fieldW - radius, Math.max(radius, b.x + Math.cos(ang) * radius * 2));
      const y = Math.min(fieldH - radius, Math.max(radius, b.y + Math.sin(ang) * radius * 2));
      const child = w.makeBacterium(inherit(b.genome, w.cfg, w.rng), x, y, w.rng.range(0, TAU), b.energy, b);
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

/** Смерть от голода и от старости. */
export const death: System = {
  name: 'death',
  run(w) {
    let alive = 0;
    const list = w.bacteria;
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
        if (w.events.has('died')) w.events.emit('died', { b, cause: hunger ? 'hunger' : 'age' });
      } else {
        list[alive++] = b;
      }
    }
    list.length = alive;
  },
};

/** Защита от вымирания: досыпаем случайных бактерий. */
export const reseed: System = {
  name: 'reseed',
  run(w) {
    const n = w.cfg.minPop - w.bacteria.length;
    if (n <= 0) return;
    for (let i = 0; i < n; i++) w.spawnRandom();
    w.totals.reseeds++;
    w.acc.reseeds++;
    if (w.events.has('reseeded')) w.events.emit('reseeded', { count: n });
  },
};

export const defaultSystems: System[] = [foodSpawn, sense, think, move, eat, metabolism, reproduce, death, reseed];

export { randomGenome };
