import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../src/core/config';
import { Simulation } from '../src/sim/simulation';

const cfg = (over: Record<string, number> = {}) => ({ ...defaultConfig(), ...over });

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

  it('инварианты: энергия, границы, лимит популяции, еда', () => {
    const c = cfg({ seed: 9, maxPop: 120, maxFood: 200 });
    const s = Simulation.create(c);
    for (let i = 0; i < 20; i++) {
      s.run(200);
      const w = s.world;
      expect(w.bacteria.length).toBeLessThanOrEqual(c.maxPop);
      expect(w.foods.length).toBeLessThanOrEqual(c.maxFood);
      for (const b of w.bacteria) {
        expect(b.energy).toBeGreaterThan(0);
        expect(b.energy).toBeLessThanOrEqual(c.maxEnergy);
        expect(b.x).toBeGreaterThanOrEqual(0);
        expect(b.x).toBeLessThanOrEqual(c.fieldW);
        expect(b.y).toBeGreaterThanOrEqual(0);
        expect(b.y).toBeLessThanOrEqual(c.fieldH);
      }
    }
  });

  it('деление: потомок с новым поколением и энергия пополам', () => {
    const s = Simulation.create(cfg({ seed: 2, initialPop: 1, minPop: 0, divideFood: 1, divideEnergy: 10, metabolism: 0, moveCost: 0 }));
    const w = s.world;
    const parent = w.bacteria[0];
    parent.energy = 100;
    parent.eatenSince = 1;
    const before = w.totals.births;
    w.tick();
    expect(w.totals.births).toBe(before + 1);
    const child = w.bacteria.find((b) => b.parentId === parent.id)!;
    expect(child.generation).toBe(1);
    expect(child.lineage).toBe(parent.lineage);
    expect(child.energy).toBeCloseTo(parent.energy, 5);
    expect(parent.eatenSince).toBe(0);
  });

  it('смерть от старости и от голода учитывается раздельно', () => {
    const s = Simulation.create(cfg({ seed: 3, initialPop: 2, minPop: 0, maxFood: 0, foodPerTick: 0 }));
    const w = s.world;
    w.bacteria[0].age = w.bacteria[0].maxAge;
    w.bacteria[1].energy = 0.01;
    w.tick();
    expect(w.totals.deathsAge).toBe(1);
    expect(w.totals.deathsHunger).toBe(1);
    expect(w.bacteria.length).toBe(0);
  });

  it('подсев при вымирании', () => {
    const s = Simulation.create(cfg({ seed: 4, initialPop: 3, minPop: 5, maxFood: 0, foodPerTick: 0 }));
    s.world.bacteria.forEach((b) => (b.energy = 0.01));
    s.world.tick();
    expect(s.world.bacteria.length).toBe(5);
    expect(s.world.totals.reseeds).toBe(1);
  });

  it('сохранение и загрузка дают то же продолжение', () => {
    const a = Simulation.create(cfg({ seed: 8 }));
    a.run(700);
    const b = Simulation.fromJSON(JSON.parse(JSON.stringify(a.toJSON())));
    expect(b.world.bacteria.length).toBe(a.world.bacteria.length);
    expect(b.recorder.history.times.length).toBe(a.recorder.history.times.length);
    // веса в сохранении округлены — поведение допускает лишь микро-расхождения, но счётчики и размер мира совпадают
    b.run(1);
    a.run(1);
    expect(b.world.foods.length).toBe(a.world.foods.length);
  });

  it('популяция сама учится ехать к еде (направленность растёт)', () => {
    const s = Simulation.create(cfg({ seed: 12345 }));
    s.run(1000);
    const h = s.recorder.history;
    const early = h.data.directionality.slice(0, 5).reduce((a, b) => a + b, 0) / 5;
    s.run(7000);
    const n = h.data.directionality.length;
    const late = h.data.directionality.slice(n - 20).reduce((a, b) => a + b, 0) / 20;
    expect(late).toBeGreaterThan(0.5);
    expect(late).toBeGreaterThan(early + 0.3);
  }, 60000);
});
