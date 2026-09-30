import { Emitter } from '../core/events';
import { type Config, type ParamKey, normalizeConfig } from '../core/config';
import { BucketGrid, Grid } from '../core/spatial';
import { Rng } from '../core/rng';
import { Bacterium, Food } from './entities';
import { type Genome, type GenomeJSON, genomeFromJSON, genomeToJSON, randomGenome } from './genome';
import { type Sensor, buildSensors } from './sensors';
import { type Actuator, defaultActuators } from './actuators';
import { type System, defaultSystems, spawnOneFood } from './systems';
import { type Patch, type Zone, makePatches, makeZones } from './env';
import { FP_SIZE, classify } from './behavior';

export interface SimEvents {
  born: { child: Bacterium };
  died: { b: Bacterium; cause: 'hunger' | 'age' };
  ate: { b: Bacterium };
  reseeded: { count: number };
  extinct: { tick: number };
  configChanged: { key: ParamKey; value: number; old: number; source: 'user' | 'scenario' };
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
  /** сколько случайных бактерий было создано (стартовые + подсев) */
  founders: number;
}

export interface ScenarioStep {
  tick: number;
  key: ParamKey;
  value: number;
  done?: boolean;
}

export const newAccum = (): Accum => ({
  births: 0, deathsHunger: 0, deathsAge: 0, eaten: 0, lifeSum: 0, lifeN: 0,
  dirSum: 0, dirN: 0, thrustSum: 0, thrustN: 0, reseeds: 0,
});

export interface BacteriumJSON {
  id: number; parentId: number; gen: number; lineage: number;
  x: number; y: number; angle: number; energy: number; age: number; maxAge: number;
  eaten: number; eatenSince: number; children: number; genome: GenomeJSON; fp?: number[];
}

export interface WorldJSON {
  cfg: Config;
  time: number;
  rngState: number;
  nextId: number;
  foodAcc: number;
  toxicAcc?: number;
  extinctAt?: number;
  totals: Totals;
  acc: Accum;
  /** [x, y, энергия?, куст?] */
  foods: number[][];
  patches?: Patch[];
  zones?: Zone[];
  scenario?: ScenarioStep[];
  bacteria: BacteriumJSON[];
}

const GRID_CELL = 60;

export class World {
  time = 0;
  nextId = 1;
  foodAcc = 0;
  toxicAcc = 0;
  /** тик вымирания или -1 */
  extinctAt = -1;
  bacteria: Bacterium[] = [];
  foods: Food[] = [];
  patches: Patch[] = [];
  zones: Zone[] = [];
  scenario: ScenarioStep[] = [];
  foodGrid: Grid<Food>;
  peerGrid: BucketGrid<Bacterium>;
  rng: Rng;
  readonly events = new Emitter<SimEvents>();
  totals: Totals = { births: 0, deathsHunger: 0, deathsAge: 0, eaten: 0, reseeds: 0, maxGen: 0, founders: 0 };
  acc: Accum = newAccum();

  readonly sensors: Sensor[];
  readonly actuators: Actuator[];
  readonly systems: System[];
  readonly inputOffsets: number[] = [];
  readonly nIn: number;
  readonly nOut: number;

  constructor(
    public cfg: Config,
    systems: System[] = defaultSystems,
    actuators: Actuator[] = defaultActuators,
  ) {
    this.rng = new Rng(cfg.seed);
    this.sensors = buildSensors(cfg);
    this.actuators = actuators;
    this.systems = systems;
    let n = 0;
    for (const s of this.sensors) {
      this.inputOffsets.push(n);
      n += s.labels.length;
    }
    this.nIn = n;
    this.nOut = actuators.length;
    this.foodGrid = new Grid<Food>(cfg.fieldW, cfg.fieldH, GRID_CELL);
    this.peerGrid = new BucketGrid<Bacterium>(cfg.fieldW, cfg.fieldH, GRID_CELL);
  }

  /** Новый мир: среда, стартовая популяция и половина запаса еды. */
  static create(cfg: Config): World {
    const w = new World(cfg);
    w.patches = makePatches(cfg, w.rng);
    w.zones = makeZones(cfg, w.rng);
    for (let i = 0; i < cfg.initialPop; i++) w.spawnRandom();
    w.seedFood(Math.floor(cfg.maxFood / 2));
    return w;
  }

  get extinct(): boolean {
    return this.extinctAt >= 0;
  }

  tick(): void {
    for (const s of this.systems) s.run(this);
    this.time++;
  }

  // ---- физика с учётом черт тела ----
  // Размер — линейный масштаб тела, масса ∝ размер². Как в природе: запас энергии и
  // стоимость движения растут с массой, а обмен веществ медленнее (∝ масса^0.75).
  radiusOf(b: Bacterium): number {
    return this.cfg.radius * b.genome.traits.size;
  }
  maxEnergyOf(b: Bacterium): number {
    return this.cfg.maxEnergy * b.genome.traits.size ** 2;
  }
  visionOf(b: Bacterium): number {
    return this.cfg.visionRadius * b.genome.traits.vision;
  }
  maxSpeedOf(b: Bacterium): number {
    const t = b.genome.traits;
    const slow = b.zone === 0 ? this.cfg.viscousSlow : 1;
    return this.cfg.maxSpeed * t.speed * slow;
  }
  /** Расход энергии за тик на поддержание жизни (без движения). */
  upkeepOf(b: Bacterium): number {
    const t = b.genome.traits;
    const c = this.cfg;
    return (
      c.metabolism * t.size ** 1.5 * (0.6 + 0.4 * t.lifespan) +
      c.speedUpkeep * t.speed * t.speed +
      c.visionCost * t.vision * t.vision +
      (b.zone === 1 ? c.toxicCost : 0)
    );
  }
  moveCostOf(b: Bacterium): number {
    const t = b.genome.traits;
    const v = b.thrust * t.speed;
    return this.cfg.moveCost * t.size * t.size * v * v * (b.zone === 0 ? 1 / this.cfg.viscousSlow : 1);
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

  /** Начальная еда — распределена так же, как при обычном появлении. */
  seedFood(n: number): void {
    for (let i = 0; i < n; i++) spawnOneFood(this);
  }

  /** Создаёт бактерию (в популяцию не добавляет). */
  makeBacterium(genome: Genome, x: number, y: number, angle: number, energy: number, parent?: Bacterium): Bacterium {
    const id = this.nextId++;
    const age = this.cfg.maxAge * genome.traits.lifespan * (1 + (this.rng.next() * 2 - 1) * this.cfg.ageSpread);
    const b = new Bacterium(
      id, parent?.id ?? 0, parent ? parent.generation + 1 : 0, parent ? parent.lineage : id,
      x, y, Math.max(1, Math.round(age)), genome, this.nIn, this.nOut, this.cfg.sectors,
    );
    b.angle = angle;
    b.energy = energy;
    if (parent) {
      // потомок начинает с «привычек» родителя, пока не проявит свои
      b.fp.set(parent.fp);
      b.type = parent.type;
      b.strategy = parent.strategy;
    } else {
      classify(b);
    }
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
    this.totals.founders++;
    return b;
  }

  setConfig(key: ParamKey, value: number, source: 'user' | 'scenario' = 'user'): void {
    const old = this.cfg[key];
    this.cfg[key] = value;
    this.events.emit('configChanged', { key, value, old, source });
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
      toxicAcc: this.toxicAcc,
      extinctAt: this.extinctAt,
      totals: { ...this.totals },
      acc: { ...this.acc },
      foods: this.foods.map((f) => [r(f.x), r(f.y), r(f.e), f.patch]),
      patches: this.patches.map((p) => ({ ...p })),
      zones: this.zones.map((z) => ({ ...z })),
      scenario: this.scenario.map((s) => ({ ...s })),
      bacteria: this.bacteria.map((b) => ({
        id: b.id, parentId: b.parentId, gen: b.generation, lineage: b.lineage,
        x: r(b.x), y: r(b.y), angle: Math.round(b.angle * 1e4) / 1e4, energy: r(b.energy),
        age: b.age, maxAge: b.maxAge, eaten: b.eaten, eatenSince: b.eatenSince,
        children: b.children, genome: genomeToJSON(b.genome), fp: Array.from(b.fp, (v) => Math.round(v * 1e4) / 1e4),
      })),
    };
  }

  static fromJSON(j: WorldJSON): World {
    const w = new World(normalizeConfig(j.cfg));
    w.time = j.time;
    w.rng.state = j.rngState;
    w.nextId = j.nextId;
    w.foodAcc = j.foodAcc;
    w.toxicAcc = j.toxicAcc ?? 0;
    w.extinctAt = j.extinctAt ?? -1;
    w.totals = { ...w.totals, ...j.totals };
    w.acc = { ...newAccum(), ...j.acc };
    w.patches = j.patches ?? [];
    w.zones = j.zones ?? [];
    w.scenario = j.scenario ?? [];
    for (const [x, y, e, p] of j.foods) w.addFood(new Food(x, y, e ?? w.cfg.foodEnergy, p ?? -1));
    for (const s of j.bacteria) {
      const b = new Bacterium(
        s.id, s.parentId, s.gen, s.lineage, s.x, s.y, s.maxAge, genomeFromJSON(s.genome, w.cfg), w.nIn, w.nOut, w.cfg.sectors,
      );
      b.angle = s.angle;
      b.energy = s.energy;
      b.age = s.age;
      b.eaten = s.eaten;
      b.eatenSince = s.eatenSince;
      b.children = s.children;
      if (s.fp?.length === FP_SIZE) b.fp.set(s.fp);
      classify(b);
      w.bacteria.push(b);
    }
    return w;
  }
}
