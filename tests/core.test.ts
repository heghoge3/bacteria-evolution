import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { BucketGrid, Grid } from '../src/core/spatial';
import { Food } from '../src/sim/entities';
import { MLP } from '../src/sim/brain';
import { PARAMS, PRESETS, defaultConfig, normalizeConfig, presetConfig } from '../src/core/config';
import { HeatHistory, History } from '../src/stats/history';

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

describe('сетки', () => {
  it('Grid находит ближайший и учитывает удаление', () => {
    const g = new Grid<Food>(500, 500, 50);
    const a = new Food(100, 100, 1), b = new Food(120, 100, 1), c = new Food(400, 400, 1);
    [a, b, c].forEach((f) => g.add(f));
    expect(g.nearest(105, 100, 100)).toBe(a);
    g.remove(a);
    expect(g.nearest(105, 100, 100)).toBe(b);
    expect(g.nearest(300, 300, 50)).toBeNull();
    expect(g.nearest(390, 390, 50)).toBe(c);
  });
  it('BucketGrid возвращает соседние ячейки', () => {
    const g = new BucketGrid<{ x: number; y: number }>(300, 300, 50);
    const pts = [{ x: 10, y: 10 }, { x: 60, y: 10 }, { x: 290, y: 290 }];
    g.rebuild(pts);
    const found: unknown[] = [];
    g.forEachNear(20, 20, 50, (o) => found.push(o));
    expect(found).toContain(pts[0]);
    expect(found).toContain(pts[1]);
    expect(found).not.toContain(pts[2]);
  });
});

describe('мозг', () => {
  it('выходы в [-1,1], клон независим, мутации меняют веса, JSON сохраняет поведение', () => {
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
  it('мозг с памятью: одинаковый вход даёт разный выход во времени', () => {
    const m = MLP.random(3, 6, 2, new Rng(5), true);
    expect(m.kind).toBe('rnn');
    const inp = new Float32Array([1, 0.5, 1]);
    const a = new Float32Array(2), b = new Float32Array(2);
    m.forward(inp, a);
    m.forward(inp, b);
    expect(Array.from(a)).not.toEqual(Array.from(b));
    const j = MLP.fromJSON(JSON.parse(JSON.stringify(m.toJSON())));
    expect(j.kind).toBe('rnn');
    expect(j.wr?.length).toBe(36);
  });
});

describe('конфигурация', () => {
  it('значения по умолчанию в допустимых границах', () => {
    const c = defaultConfig();
    for (const p of PARAMS) {
      expect(c[p.key]).toBeGreaterThanOrEqual(p.min);
      expect(c[p.key]).toBeLessThanOrEqual(p.max);
    }
  });
  it('пресеты задают только существующие параметры в границах', () => {
    for (const pr of PRESETS) {
      const c = presetConfig(pr.id);
      for (const p of PARAMS) {
        expect(c[p.key], `${pr.id}.${p.key}`).toBeGreaterThanOrEqual(p.min);
        expect(c[p.key], `${pr.id}.${p.key}`).toBeLessThanOrEqual(p.max);
      }
      for (const k of Object.keys(pr.over)) expect(PARAMS.some((p) => p.key === k), `${pr.id}.${k}`).toBe(true);
    }
  });
  it('normalizeConfig отбрасывает лишнее и достраивает недостающее', () => {
    const c = normalizeConfig({ foodEnergy: 7, bogus: 1 });
    expect(c.foodEnergy).toBe(7);
    expect((c as Record<string, number>).bogus).toBeUndefined();
    expect(c.maxFood).toBe(defaultConfig().maxFood);
  });
});

describe('история', () => {
  it('сжатие сохраняет минимум и максимум', () => {
    const h = new History(10);
    for (let i = 0; i < 12000; i++) h.push(i * 10, { a: i === 500 ? 1000 : 1 });
    expect(h.coarseT.length).toBeGreaterThan(0);
    expect(h.fineT.length).toBeLessThanOrEqual(4000);
    const v = h.view();
    expect(v.t.length).toBe(v.mean.a.length);
    expect(Math.max(...v.max.a)).toBe(1000);
    // время монотонно растёт
    for (let i = 1; i < v.t.length; i++) expect(v.t[i]).toBeGreaterThan(v.t[i - 1]);
  });
  it('длинная история не растёт бесконечно', () => {
    const h = new History(1);
    for (let i = 0; i < 60000; i++) h.push(i, { a: Math.sin(i) });
    expect(h.length).toBeLessThanOrEqual(6100);
    expect(h.bin).toBeGreaterThan(8);
  });
  it('JSON и старый формат', () => {
    const h = new History(10);
    for (let i = 0; i < 100; i++) h.push(i * 10, { a: i, b: NaN });
    const r = History.fromJSON(JSON.parse(JSON.stringify(h.toJSON())));
    expect(r.last('a')).toBe(99);
    expect(Number.isNaN(r.last('b'))).toBe(true);
    const legacy = History.fromLegacy({ interval: 50, times: [50, 100], data: { pop: [3, 4] } });
    expect(legacy.last('pop')).toBe(4);
  });
  it('тепловая история прореживается', () => {
    const h = new HeatHistory(100);
    for (let i = 0; i < 250; i++) h.push(i, { x: [0.5, 0.5] });
    expect(h.times.length).toBeLessThanOrEqual(100);
    expect(h.data.x.length).toBe(h.times.length);
  });
});
