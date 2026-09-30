/**
 * Схема параметров. Добавить параметр = добавить одну строку сюда:
 * панель настроек в интерфейсе строится из этого списка автоматически.
 */
export interface ParamDef {
  key: string;
  label: string;
  group: string;
  min: number;
  max: number;
  step: number;
  def: number;
  /** true — значение применяется только после сброса мира */
  restart?: boolean;
}

export const PARAMS = [
  { key: 'seed', label: 'Seed (зерно случайности)', group: 'Мир', min: 0, max: 4294967295, step: 1, def: 12345, restart: true },
  { key: 'fieldW', label: 'Ширина поля', group: 'Мир', min: 300, max: 4000, step: 50, def: 1200, restart: true },
  { key: 'fieldH', label: 'Высота поля', group: 'Мир', min: 300, max: 4000, step: 50, def: 800, restart: true },

  { key: 'maxFood', label: 'Максимум еды на поле', group: 'Еда', min: 0, max: 5000, step: 10, def: 400 },
  { key: 'foodPerTick', label: 'Появление еды (шт. за тик)', group: 'Еда', min: 0, max: 20, step: 0.05, def: 0.5 },
  { key: 'foodEnergy', label: 'Энергия от одной еды', group: 'Еда', min: 1, max: 500, step: 1, def: 40 },
  { key: 'foodRadius', label: 'Радиус еды', group: 'Еда', min: 1, max: 20, step: 0.5, def: 3 },

  { key: 'initialPop', label: 'Стартовая популяция', group: 'Популяция', min: 1, max: 2000, step: 1, def: 60, restart: true },
  { key: 'minPop', label: 'Минимум (ниже — подсев случайных)', group: 'Популяция', min: 0, max: 500, step: 1, def: 10 },
  { key: 'maxPop', label: 'Лимит популяции', group: 'Популяция', min: 10, max: 5000, step: 10, def: 1000 },

  { key: 'hiddenSize', label: 'Скрытых нейронов', group: 'Мозг', min: 1, max: 32, step: 1, def: 6, restart: true },
  { key: 'visionRadius', label: 'Радиус зрения', group: 'Мозг', min: 10, max: 1000, step: 5, def: 150 },

  { key: 'startEnergy', label: 'Стартовая энергия', group: 'Бактерия', min: 1, max: 1000, step: 1, def: 100 },
  { key: 'maxEnergy', label: 'Максимальная энергия', group: 'Бактерия', min: 10, max: 2000, step: 1, def: 200 },
  { key: 'metabolism', label: 'Метаболизм (расход за тик)', group: 'Бактерия', min: 0, max: 5, step: 0.01, def: 0.1 },
  { key: 'moveCost', label: 'Стоимость движения (× тяга²)', group: 'Бактерия', min: 0, max: 5, step: 0.01, def: 0.08 },
  { key: 'maxSpeed', label: 'Макс. скорость (ед./тик)', group: 'Бактерия', min: 0.1, max: 20, step: 0.1, def: 2 },
  { key: 'maxTurn', label: 'Макс. поворот (рад/тик)', group: 'Бактерия', min: 0.01, max: 1.5, step: 0.01, def: 0.15 },
  { key: 'radius', label: 'Радиус бактерии', group: 'Бактерия', min: 1, max: 30, step: 0.5, def: 5 },
  { key: 'maxAge', label: 'Макс. возраст (тиков)', group: 'Бактерия', min: 100, max: 100000, step: 100, def: 3000 },
  { key: 'ageSpread', label: 'Разброс возраста (0.2 = ±20%)', group: 'Бактерия', min: 0, max: 0.9, step: 0.01, def: 0.2 },

  { key: 'divideFood', label: 'Съесть для деления (шт.)', group: 'Деление', min: 1, max: 50, step: 1, def: 3 },
  { key: 'divideEnergy', label: 'Мин. энергия для деления', group: 'Деление', min: 2, max: 1000, step: 1, def: 60 },

  { key: 'mutRate', label: 'Доля мутирующих весов', group: 'Мутации', min: 0, max: 1, step: 0.01, def: 0.1 },
  { key: 'mutSigma', label: 'Сила мутации (σ)', group: 'Мутации', min: 0, max: 2, step: 0.01, def: 0.2 },
  { key: 'mutBig', label: 'Доля полной замены веса', group: 'Мутации', min: 0, max: 1, step: 0.005, def: 0.01 },
  { key: 'hueDrift', label: 'Дрейф цвета семьи', group: 'Мутации', min: 0, max: 0.2, step: 0.005, def: 0.02 },
] as const satisfies readonly ParamDef[];

export type ParamKey = (typeof PARAMS)[number]['key'];
export type Config = Record<ParamKey, number>;

export function defaultConfig(): Config {
  const c = {} as Config;
  for (const p of PARAMS) c[p.key] = p.def;
  return c;
}

/** Достраивает конфиг из сохранения: неизвестные ключи отбрасываются, новые — по умолчанию. */
export function normalizeConfig(raw: Partial<Record<string, number>> | undefined): Config {
  const c = defaultConfig();
  if (raw) for (const p of PARAMS) if (typeof raw[p.key] === 'number') c[p.key] = raw[p.key]!;
  return c;
}
