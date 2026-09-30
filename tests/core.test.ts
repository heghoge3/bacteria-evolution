import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { Grid } from '../src/core/spatial';
import { Food } from '../src/sim/entities';
import { MLP } from '../src/sim/brain';
import { defaultConfig, PARAMS } from '../src/core/config';
import { History } from '../src/stats/history';

describe('rng', () => {
  it('детерминирован по seed', () => {
    const a = new Rng(7), b = new Rng(7);
    for (let i = 0; i < 50; i++) expect(a.next()).toBe(b.next());
  });
  it('состояние можно восстановить', () => {
    const a = new Rng(3);
    a.next();
    const b = new Rng(0);
    b.state = a.state;
    expect(b.next()).toBe(a.next());
  });
  it('значения в [0,1)', () => {
    const r = new Rng(1);
    for (let i = 0; i < 1000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('grid', () => {
  it('находит ближайший и учитывает удаление', () => {
    const g = new Grid<Food>(500, 500, 50);
    const a = new Food(100, 100), b = new Food(120, 100), c = new Food(400, 400);
    [a, b, c].forEach((f) => g.add(f));
    expect(g.nearest(105, 100, 100)).toBe(a);
    g.remove(a);
    expect(g.nearest(105, 100, 100)).toBe(b);
    expect(g.nearest(300, 300, 50)).toBeNull();
    expect(g.nearest(390, 390, 50)).toBe(c);
  });
});

describe('mlp', () => {
  it('выходы в [-1,1], клон независим, мутации меняют веса', () => {
    const rng = new Rng(1);
    const m = MLP.random(5, 6, 2, rng);
    const out = new Float32Array(2);
    m.forward(new Float32Array([1, 0, 1, 0.5, 1]), out);
    for (const v of out) expect(Math.abs(v)).toBeLessThanOrEqual(1);
    const c = m.clone();
    expect(c.w1).toEqual(m.w1);
    c.mutate(rng, { rate: 1, sigma: 0.5, big: 0 });
    expect(c.w1).not.toEqual(m.w1);
    const j = MLP.fromJSON(JSON.parse(JSON.stringify(m.toJSON())));
    const o2 = new Float32Array(2);
    j.forward(new Float32Array([1, 0, 1, 0.5, 1]), o2);
    expect(o2[0]).toBeCloseTo(out[0], 4);
  });
  it('нулевые мутации ничего не меняют', () => {
    const rng = new Rng(2);
    const m = MLP.random(5, 6, 2, rng);
    const c = m.clone();
    c.mutate(rng, { rate: 0, sigma: 1, big: 0 });
    expect(c.w2).toEqual(m.w2);
  });
});

describe('config', () => {
  it('у каждого параметра значение по умолчанию в допустимых границах', () => {
    const c = defaultConfig();
    for (const p of PARAMS) {
      expect(c[p.key]).toBeGreaterThanOrEqual(p.min);
      expect(c[p.key]).toBeLessThanOrEqual(p.max);
    }
  });
});

describe('history', () => {
  it('прореживается и удваивает интервал', () => {
    const h = new History(10, 100);
    for (let i = 1; i <= 101; i++) h.push(i * 10, { a: i });
    expect(h.times.length).toBeLessThanOrEqual(100);
    expect(h.interval).toBe(20);
    expect(h.data.a.length).toBe(h.times.length);
  });
});
