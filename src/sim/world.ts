import { Emitter } from '../core/events';
import { type Config, normalizeConfig } from '../core/config';
import { Grid } from '../core/spatial';
import { Rng } from '../core/rng';
import { Bacterium, Food } from './entities';
import { type Genome, type GenomeJSON, genomeFromJSON, genomeToJSON, randomGenome } from './genome';
import { type Sensor, defaultSensors } from './sensors';
import { type Actuator, defaultActuators } from './actuators';
import { type System, defaultSystems } from './systems';

export interface SimEvents {
  born: { child: Bacterium };
  died: { b: Bacterium; cause: 'hunger' | 'age' };
  ate: { b: Bacterium };
  reseeded: { count: number };
  configChanged: { key: string; value: number };
}

/** Накопители за интервал между замерами статистики (обнуляются рекордером). */
export interface Accum {
  births: number;
  deathsHunger: number;
  deathsAge: number;
  eaten: number;
  lifeSum: number;
  lifeN: number;
  dirSum: number;
  dirN: number;
  thrustSum: number;
  thrustN: number;
  reseeds: number;
}

export interface Totals {
  births: number;
  deathsHunger: number;
  deathsAge: number;
  eaten: number;
  reseeds: number;
  maxGen: number;
}

export const newAccum = (): Accum => ({
  births: 0, deathsHunger: 0, deathsAge: 0, eaten: 0, lifeSum: 0, lifeN: 0,
  dirSum: 0, dirN: 0, thrustSum: 0, thrustN: 0, reseeds: 0,
});

export interface WorldJSON {
  cfg: Config;
  time: number;
  rngState: number;
  nextId: number;
  foodAcc: number;
  totals: Totals;
  acc: Accum;
  foods: [number, number][];
  bacteria: {
    id: number; parentId: number; gen: number; lineage: number;
    x: number; y: number; angle: number; energy: number; age: number; maxAge: number;
    eaten: number; eatenSince: number; children: number; genome: GenomeJSON;
  }[];
}

const GRID_CELL = 75;

export class World {
  time = 0;
  nextId = 1;
  foodAcc = 0;
  bacteria: Bacterium[] = [];
  foods: Food[] = [];
  foodGrid: Grid<Food>;
  rng: Rng;
  readonly events = new Emitter<SimEvents>();
  totals: Totals = { births: 0, deathsHunger: 0, deathsAge: 0, eaten: 0, reseeds: 0, maxGen: 0 };
  acc: Accum = newAccum();

  readonly sensors: Sensor[];
  readonly actuators: Actuator[];
  readonly systems: System[];
  readonly inputOffsets: number[] = [];
  readonly nIn: number;
  readonly nOut: number;

  constructor(
    public cfg: Config,
    sensors: Sensor[] = defaultSensors,
    actuators: Actuator[] = defaultActuators,
    systems: System[] = defaultSystems,
  ) {
    this.rng = new Rng(cfg.seed);
    this.sensors = sensors;
    this.actuators = actuators;
    this.systems = systems;
    let n = 0;
    for (const s of sensors) {
      this.inputOffsets.push(n);
      n += s.labels.length;
    }
    this.nIn = n;
    this.nOut = actuators.length;
    this.foodGrid = new Grid<Food>(cfg.fieldW, cfg.fieldH, GRID_CELL);
  }

  /** Новый мир: стартовая популяция и половина запаса еды. */
  static create(cfg: Config): World {
    const w = new World(cfg);
    for (let i = 0; i < cfg.initialPop; i++) w.spawnRandom();
    const n = Math.floor(cfg.maxFood / 2);
    for (let i = 0; i < n; i++) w.addFood(new Food(w.rng.range(0, cfg.fieldW), w.rng.range(0, cfg.fieldH)));
    return w;
  }

  tick(): void {
    for (const s of this.systems) s.run(this);
    this.time++;
  }

  // ---- сущности ----
  addFood(f: Food): void {
    f.idx = this.foods.length;
    this.foods.push(f);
    this.foodGrid.add(f);
  }

  removeFood(f: Food): void {
    this.foodGrid.remove(f);
    const last = this.foods.pop()!;
    if (last !== f) {
      this.foods[f.idx] = last;
      last.idx = f.idx;
    }
  }

  /** Создаёт бактерию (в популяцию не добавляет). */
  makeBacterium(genome: Genome, x: number, y: number, angle: number, energy: number, parent?: Bacterium): Bacterium {
    const id = this.nextId++;
    const age = this.cfg.maxAge * (1 + (this.rng.next() * 2 - 1) * this.cfg.ageSpread);
    const b = new Bacterium(
      id, parent?.id ?? 0, parent ? parent.generation + 1 : 0, parent ? parent.lineage : id,
      x, y, Math.max(1, Math.round(age)), genome, this.nIn, this.nOut,
    );
    b.angle = angle;
    b.energy = energy;
    return b;
  }

  spawnRandom(): Bacterium {
    const c = this.cfg;
    const r = this.rng;
    const g = randomGenome(this.nIn, this.nOut, c, r);
    const b = this.makeBacterium(
      g, r.range(c.radius, c.fieldW - c.radius), r.range(c.radius, c.fieldH - c.radius),
      r.range(0, Math.PI * 2), c.startEnergy,
    );
    this.bacteria.push(b);
    return b;
  }

  setConfig(key: keyof Config, value: number): void {
    this.cfg[key] = value;
    this.events.emit('configChanged', { key, value });
  }

  // ---- сохранение ----
  toJSON(): WorldJSON {
    const r = (v: number) => Math.round(v * 100) / 100;
    return {
      cfg: { ...this.cfg },
      time: this.time,
      rngState: this.rng.state,
      nextId: this.nextId,
      foodAcc: this.foodAcc,
      totals: { ...this.totals },
      acc: { ...this.acc },
      foods: this.foods.map((f) => [f.x, f.y]),
      bacteria: this.bacteria.map((b) => ({
        id: b.id, parentId: b.parentId, gen: b.generation, lineage: b.lineage,
        x: r(b.x), y: r(b.y), angle: Math.round(b.angle * 1e4) / 1e4, energy: r(b.energy),
        age: b.age, maxAge: b.maxAge, eaten: b.eaten, eatenSince: b.eatenSince,
        children: b.children, genome: genomeToJSON(b.genome),
      })),
    };
  }

  static fromJSON(j: WorldJSON): World {
    const w = new World(normalizeConfig(j.cfg));
    w.time = j.time;
    w.rng.state = j.rngState;
    w.nextId = j.nextId;
    w.foodAcc = j.foodAcc;
    w.totals = { ...w.totals, ...j.totals };
    w.acc = { ...newAccum(), ...j.acc };
    for (const [x, y] of j.foods) w.addFood(new Food(x, y));
    for (const s of j.bacteria) {
      const b = new Bacterium(
        s.id, s.parentId, s.gen, s.lineage, s.x, s.y, s.maxAge, genomeFromJSON(s.genome), w.nIn, w.nOut,
      );
      b.angle = s.angle;
      b.energy = s.energy;
      b.age = s.age;
      b.eaten = s.eaten;
      b.eatenSince = s.eatenSince;
      b.children = s.children;
      w.bacteria.push(b);
    }
    return w;
  }
}
