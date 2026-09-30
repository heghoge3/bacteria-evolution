import { World } from '../sim/world';
import type { Bacterium } from '../sim/entities';
import { cloneGenome } from '../sim/genome';
import { isolatedSystems } from '../sim/systems';
import { makePatches, makeZones } from '../sim/env';

const EXAM_SEED = 777;
const EXAM_TICKS = 2000;
const EXAM_COUNT = 8;

/**
 * Экзамен: лучшие бактерии по очереди проходят одинаковый фиксированный мир в одиночку.
 * Результат не зависит от численности и конкуренции — честная мера «ума».
 */
export function runExam(w: World): { mean: number; best: number } | null {
  const cands = w.bacteria
    .filter((b) => b.age > 300)
    .sort((a, b) => b.eaten / b.age - a.eaten / a.age)
    .slice(0, EXAM_COUNT);
  if (!cands.length) return null;
  const scores = cands.map((b) => examOne(w, b));
  return { mean: scores.reduce((s, v) => s + v, 0) / scores.length, best: Math.max(...scores) };
}

function examOne(src: World, b: Bacterium): number {
  const cfg = { ...src.cfg, seed: EXAM_SEED, reseed: 0, seasonLength: 0 };
  const w = new World(cfg, isolatedSystems);
  w.patches = makePatches(cfg, w.rng);
  w.zones = makeZones(cfg, w.rng);
  w.seedFood(Math.floor(cfg.maxFood / 2));
  const t = w.makeBacterium(cloneGenome(b.genome), cfg.fieldW / 2, cfg.fieldH / 2, 0, cfg.startEnergy);
  t.maxAge = Infinity;
  w.bacteria.push(t);
  for (let i = 0; i < EXAM_TICKS && w.bacteria.length; i++) w.tick();
  return t.eaten;
}
