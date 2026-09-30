import type { Bacterium } from './entities';

/**
 * Поведенческий «отпечаток» — скользящие средние того, как бактерия живёт.
 * По отпечатку и чертам тела бактерия относится к типу поведения (цвет на поле)
 * и получает уточняющие метки. Тип + метки = стратегия.
 */
export const FP = {
  speed: 0,
  turn: 1,
  directed: 2,
  wall: 3,
  crowd: 4,
  foodRich: 5,
} as const;
export const FP_SIZE = 6;

export const FP_LABELS: { key: keyof typeof FP; label: string; max: number }[] = [
  { key: 'speed', label: 'Скорость движения', max: 2 },
  { key: 'turn', label: 'Резкость поворотов', max: 1 },
  { key: 'directed', label: 'Направленность к еде', max: 1 },
  { key: 'wall', label: 'Близость к стенам', max: 1 },
  { key: 'crowd', label: 'Теснота (соседи рядом)', max: 1 },
  { key: 'foodRich', label: 'Еды в поле зрения', max: 1 },
];

/** ≈ за сколько тиков забывается старое поведение */
const EMA = 1 / 60;

export function neutralFingerprint(): Float32Array {
  const f = new Float32Array(FP_SIZE);
  f[FP.speed] = 0.3;
  f[FP.turn] = 0.3;
  return f;
}

/** Обновляется каждый тик после движения. */
export function updateFingerprint(b: Bacterium, speedNorm: number, turnNorm: number, wall: number): void {
  const f = b.fp;
  f[FP.speed] += (speedNorm - f[FP.speed]) * EMA;
  f[FP.turn] += (turnNorm - f[FP.turn]) * EMA;
  if (b.seesFood) f[FP.directed] += (Math.cos(b.dAngle) * Math.min(1, speedNorm * 2) - f[FP.directed]) * EMA;
  f[FP.wall] += (wall - f[FP.wall]) * EMA;
  f[FP.crowd] += (Math.min(1, b.crowd / 3) - f[FP.crowd]) * EMA;
  f[FP.foodRich] += (Math.min(1, b.foodCount / 8) - f[FP.foodRich]) * EMA;
}

// ---------------- классификация ----------------

export interface BehaviorType {
  name: string;
  /** коротко, для легенды */
  hint: string;
  color: string;
}

/** Порядок важен: индекс типа хранится в статистике. */
export const TYPES: BehaviorType[] = [
  { name: 'Стоячие', hint: 'почти не двигаются', color: '#e5534b' },
  { name: 'Кружащие', hint: 'прочёсывают местность петлями', color: '#e3b341' },
  { name: 'Быстрые охотники', hint: 'на полной скорости летят к еде', color: '#4c8dff' },
  { name: 'Охотники', hint: 'спокойно едут к еде', color: '#39c5cf' },
  { name: 'Бродяги', hint: 'двигаются без явной цели', color: '#a3acb9' },
];

export function classifyType(fp: Float32Array): number {
  const sp = fp[FP.speed];
  if (sp < 0.15) return 0;
  if (fp[FP.directed] >= 0.45) return sp >= 0.9 ? 2 : 3;
  if (fp[FP.turn] > 0.55) return 1;
  return 4;
}

interface TagRule {
  label: string;
  /** > 0 — метка подходит; чем больше, тем ярче выражена */
  score(b: Bacterium): number;
}

const TAGS: TagRule[] = [
  { label: 'у стен', score: (b) => (b.fp[FP.wall] - 0.45) / 0.3 },
  { label: 'в толпе', score: (b) => (b.fp[FP.crowd] - 0.45) / 0.3 },
  { label: 'в кустах еды', score: (b) => (b.fp[FP.foodRich] - 0.6) / 0.25 },
  { label: 'крупные', score: (b) => (b.genome.traits.size - 1.3) / 0.3 },
  { label: 'мелкие', score: (b) => (0.77 - b.genome.traits.size) / 0.15 },
  { label: 'дальнозоркие', score: (b) => (b.genome.traits.vision - 1.4) / 0.3 },
  { label: 'близорукие', score: (b) => (0.7 - b.genome.traits.vision) / 0.2 },
  { label: 'ранние размножители', score: (b) => (1.6 - b.genome.traits.divFood) / 0.5 },
  { label: 'накопители', score: (b) => (b.genome.traits.divFood - 5.5) / 2 },
  { label: 'долгожители', score: (b) => (b.genome.traits.lifespan - 1.4) / 0.3 },
  { label: 'короткоживущие', score: (b) => (0.7 - b.genome.traits.lifespan) / 0.2 },
  { label: 'щедрые родители', score: (b) => (b.genome.traits.childShare - 0.68) / 0.1 },
  { label: 'скупые родители', score: (b) => (0.32 - b.genome.traits.childShare) / 0.1 },
];

/** До двух самых выраженных меток. */
export function classifyTags(b: Bacterium): string[] {
  const hits: [number, string][] = [];
  for (const t of TAGS) {
    const s = t.score(b);
    if (s > 0) hits.push([s, t.label]);
  }
  hits.sort((a, c) => c[0] - a[0]);
  return hits.slice(0, 2).map((h) => h[1]).sort();
}

export function strategyName(type: number, tags: string[]): string {
  return [TYPES[type].name, ...tags].join(' · ');
}

/** Пересчитывает тип и стратегию бактерии. */
export function classify(b: Bacterium): void {
  b.type = classifyType(b.fp);
  b.strategy = strategyName(b.type, classifyTags(b));
}
