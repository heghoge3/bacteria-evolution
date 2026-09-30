import { describe, expect, it } from 'vitest';
import { type Config, defaultConfig, presetConfig } from '../src/core/config';
import { Simulation } from '../src/sim/simulation';
import { World } from '../src/sim/world';
import { FP, TYPES, classifyType } from '../src/sim/behavior';
import { buildSummary } from '../src/stats/report';

const cfg = (over: Partial<Config> = {}): Config => ({ ...defaultConfig(), ...over });

describe('симуляция', () => {
  it('одинаковый seed даёт одинаковый результат', () => {
    const a = Simulation.create(cfg({ seed: 5 }));
    const b = Simulation.create(cfg({ seed: 5 }));
    a.run(1500);
    b.run(1500);
    expect(a.world.bacteria.length).toBe(b.world.bacteria.length);
    expect(a.world.totals).toEqual(b.world.totals);
    expect(a.world.bacteria[0]?.x).toBe(b.world.bacteria[0]?.x);
  });

  it('инварианты: энергия, границы, лимит популяции, черты', () => {
    const c = cfg({ seed: 9, maxPop: 200 });
    const s = Simulation.create(c);
    for (let i = 0; i < 15; i++) {
      s.run(200);
      const w = s.world;
      expect(w.bacteria.length).toBeLessThanOrEqual(c.maxPop);
      for (const b of w.bacteria) {
        expect(b.energy).toBeGreaterThan(0);
        expect(b.energy).toBeLessThanOrEqual(w.maxEnergyOf(b) + 1e-6);
        expect(b.x).toBeGreaterThanOrEqual(0);
        expect(b.x).toBeLessThanOrEqual(c.fieldW);
        expect(b.y).toBeGreaterThanOrEqual(0);
        expect(b.y).toBeLessThanOrEqual(c.fieldH);
        expect(b.genome.traits.size).toBeGreaterThanOrEqual(0.5);
        expect(b.genome.traits.size).toBeLessThanOrEqual(2.5);
        expect(b.type).toBeGreaterThanOrEqual(0);
        expect(b.type).toBeLessThan(TYPES.length);
      }
    }
  });

  it('деление: потомок, энергия по доле с потерями, мутация черт', () => {
    const s = Simulation.create(cfg({ seed: 2, initialPop: 1, divideEnergy: 10, metabolism: 0, moveCost: 0, speedUpkeep: 0, visionCost: 0, divideCost: 0.2, zones: 0, maxFood: 0, foodPerTick: 0 }));
    const w = s.world;
    const parent = w.bacteria[0];
    parent.genome.traits.divFood = 1;
    parent.genome.traits.childShare = 0.5;
    parent.energy = 100;
    parent.eatenSince = 1;
    const before = w.totals.births;
    w.tick();
    expect(w.totals.births).toBe(before + 1);
    const child = w.bacteria.find((b) => b.parentId === parent.id)!;
    expect(child.generation).toBe(1);
    expect(child.lineage).toBe(parent.lineage);
    expect(child.energy).toBeCloseTo(40, 0);
    expect(parent.energy).toBeCloseTo(50, 0);
    expect(parent.eatenSince).toBe(0);
    expect(child.genome.traits.size).not.toBe(parent.genome.traits.size);
  });

  it('смерть от старости и от голода учитывается раздельно, труп становится едой', () => {
    const s = Simulation.create(cfg({ seed: 3, initialPop: 2, maxFood: 0, foodPerTick: 0, corpseEnergy: 20 }));
    const w = s.world;
    w.bacteria[0].age = w.bacteria[0].maxAge;
    w.bacteria[1].energy = 0.01;
    w.tick();
    expect(w.totals.deathsAge).toBe(1);
    expect(w.totals.deathsHunger).toBe(1);
    expect(w.bacteria.length).toBe(0);
    expect(w.foods.length).toBe(2);
  });

  it('выживание: без подсева вымирание фиксируется и симуляция останавливается', () => {
    const s = Simulation.create(cfg({ seed: 4, initialPop: 3, maxFood: 0, foodPerTick: 0 }));
    s.world.bacteria.forEach((b) => (b.energy = 0.01));
    s.run(100);
    expect(s.ended).toBe(true);
    expect(s.world.extinctAt).toBe(0);
    expect(s.world.time).toBe(1);
    expect(s.recorder.markers.some((m) => m.kind === 'extinct')).toBe(true);
    const sum = buildSummary(s, 'extinct', 'normal');
    expect(sum.ticks).toBe(0);
    expect(sum.cause).toContain('вымерла');
  });

  it('песочница: подсев при вымирании', () => {
    const s = Simulation.create(cfg({ seed: 4, initialPop: 3, minPop: 5, reseed: 1, maxFood: 0, foodPerTick: 0 }));
    s.world.bacteria.forEach((b) => (b.energy = 0.01));
    s.world.tick();
    expect(s.world.bacteria.length).toBe(5);
    expect(s.world.totals.reseeds).toBe(1);
    expect(s.ended).toBe(false);
  });

  it('сценарий меняет параметр на нужном тике и оставляет метку', () => {
    const s = Simulation.create(cfg({ seed: 6 }));
    s.world.scenario.push({ tick: 120, key: 'foodPerTick', value: 0.1 });
    s.run(119);
    expect(s.world.cfg.foodPerTick).toBe(defaultConfig().foodPerTick);
    s.run(2);
    expect(s.world.cfg.foodPerTick).toBe(0.1);
    expect(s.world.scenario[0].done).toBe(true);
    expect(s.recorder.markers.some((m) => m.kind === 'scenario')).toBe(true);
  });

  it('сохранение и загрузка дают то же продолжение', () => {
    const a = Simulation.create(cfg({ seed: 8 }));
    a.run(700);
    const b = Simulation.fromJSON(JSON.parse(JSON.stringify(a.toJSON())));
    expect(b.world.bacteria.length).toBe(a.world.bacteria.length);
    expect(b.world.patches.length).toBe(a.world.patches.length);
    expect(b.world.zones.length).toBe(a.world.zones.length);
    expect(b.recorder.history.length).toBe(a.recorder.history.length);
    b.run(1);
    a.run(1);
    expect(b.world.time).toBe(a.world.time);
  });

  it('классификация поведения', () => {
    const fp = new Float32Array(6);
    fp[FP.speed] = 0.05;
    expect(classifyType(fp)).toBe(0);
    fp[FP.speed] = 1.2;
    fp[FP.directed] = 0.7;
    expect(classifyType(fp)).toBe(2);
    fp[FP.speed] = 0.5;
    expect(classifyType(fp)).toBe(3);
    fp[FP.directed] = 0.1;
    fp[FP.turn] = 0.8;
    expect(classifyType(fp)).toBe(1);
    fp[FP.turn] = 0.2;
    expect(classifyType(fp)).toBe(4);
  });

  it('классика (v1): популяция сама учится ехать к еде', () => {
    const s = Simulation.create(presetConfig('classic', 12345));
    s.run(1000);
    const early = s.recorder.history.view().mean.directionality.slice(1, 6).reduce((a, b) => a + b, 0) / 5;
    s.run(7000);
    const d = s.recorder.history.view().mean.directionality;
    const late = d.slice(d.length - 20).reduce((a, b) => a + b, 0) / 20;
    expect(late).toBeGreaterThan(0.5);
    expect(late).toBeGreaterThan(early + 0.3);
  }, 60000);

  it('обычный мир: популяция выживает и учится двигаться к еде', () => {
    const s = Simulation.create(presetConfig('normal', 3));
    s.run(20000);
    expect(s.ended).toBe(false);
    const d = s.recorder.history.view().mean.directionality;
    const late = d.slice(d.length - 40).filter(Number.isFinite);
    expect(late.reduce((a, b) => a + b, 0) / late.length).toBeGreaterThan(0.15);
    expect(s.recorder.chronicle.epochs.length).toBeGreaterThan(0);
    expect(s.recorder.heat.times.length).toBeGreaterThan(0);
  }, 120000);

  it('изолированный мир (экзамен/аквариум) работает без размножения', () => {
    const w = World.create(cfg({ seed: 1, initialPop: 1 }));
    const iso = new World({ ...w.cfg }, w.systems.filter((x) => x.name !== 'reproduce'));
    iso.seedFood(50);
    expect(iso.foods.length).toBe(50);
  });
});
