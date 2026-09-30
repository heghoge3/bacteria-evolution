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
  /** true — значение применяется только при новом запуске */
  restart?: boolean;
  /** вид поля ввода: число (по умолчанию), флажок (0/1) или список */
  type?: 'num' | 'bool' | 'select';
  options?: string[];
  hint?: string;
}

export const PARAMS = [
  { key: 'reseed', label: 'Песочница: подсев при вымирании', group: 'Режим', min: 0, max: 1, step: 1, def: 0, type: 'bool', hint: 'Выключено — честное выживание: вымерли, запуск окончен.' },
  { key: 'minPop', label: 'Песочница: минимум популяции', group: 'Режим', min: 0, max: 500, step: 1, def: 10 },

  { key: 'seed', label: 'Seed (зерно случайности)', group: 'Мир', min: 0, max: 4294967295, step: 1, def: 12345, restart: true },
  { key: 'fieldW', label: 'Ширина поля', group: 'Мир', min: 300, max: 4000, step: 50, def: 1200, restart: true },
  { key: 'fieldH', label: 'Высота поля', group: 'Мир', min: 300, max: 4000, step: 50, def: 800, restart: true },

  { key: 'maxFood', label: 'Максимум еды на поле', group: 'Еда', min: 0, max: 5000, step: 10, def: 500 },
  { key: 'foodPerTick', label: 'Появление еды (шт. за тик)', group: 'Еда', min: 0, max: 20, step: 0.05, def: 0.6 },
  { key: 'foodEnergy', label: 'Энергия от одной еды', group: 'Еда', min: 1, max: 500, step: 1, def: 40 },
  { key: 'foodRadius', label: 'Радиус еды', group: 'Еда', min: 1, max: 20, step: 0.5, def: 3 },
  { key: 'corpseEnergy', label: 'Энергия трупа (0 — трупы исчезают)', group: 'Еда', min: 0, max: 200, step: 1, def: 20 },

  { key: 'foodPatches', label: 'Еда растёт кустами', group: 'Кусты еды', min: 0, max: 1, step: 1, def: 1, type: 'bool', restart: true },
  { key: 'patchCount', label: 'Число кустов', group: 'Кусты еды', min: 1, max: 30, step: 1, def: 6, restart: true },
  { key: 'patchRadius', label: 'Радиус куста', group: 'Кусты еды', min: 10, max: 400, step: 5, def: 80 },
  { key: 'patchShare', label: 'Доля еды в кустах', group: 'Кусты еды', min: 0, max: 1, step: 0.05, def: 0.8 },
  { key: 'patchDeplete', label: 'Истощение куста за одну съеденную еду', group: 'Кусты еды', min: 0, max: 0.5, step: 0.005, def: 0.02 },
  { key: 'patchRegen', label: 'Восстановление куста за тик', group: 'Кусты еды', min: 0, max: 0.05, step: 0.0005, def: 0.001 },
  { key: 'patchDrift', label: 'Скорость дрейфа кустов', group: 'Кусты еды', min: 0, max: 3, step: 0.01, def: 0.1 },

  { key: 'seasonLength', label: 'Длина года в тиках (0 — без сезонов)', group: 'Сезоны', min: 0, max: 200000, step: 500, def: 8000 },
  { key: 'seasonAmp', label: 'Сила сезонов (0…1)', group: 'Сезоны', min: 0, max: 1, step: 0.05, def: 0.7 },

  { key: 'zones', label: 'Особые зоны', group: 'Зоны', min: 0, max: 1, step: 1, def: 1, type: 'bool', restart: true },
  { key: 'zoneCount', label: 'Число зон', group: 'Зоны', min: 1, max: 12, step: 1, def: 4, restart: true },
  { key: 'zoneRadius', label: 'Радиус зоны', group: 'Зоны', min: 20, max: 500, step: 10, def: 130, restart: true },
  { key: 'viscousSlow', label: 'Вязкая зона: замедление (×)', group: 'Зоны', min: 0.1, max: 1, step: 0.05, def: 0.5 },
  { key: 'toxicCost', label: 'Токсичная зона: расход за тик', group: 'Зоны', min: 0, max: 2, step: 0.01, def: 0.25 },
  { key: 'toxicFood', label: 'Токсичная зона: доп. еда (доля от основной)', group: 'Зоны', min: 0, max: 2, step: 0.05, def: 0.3 },

  { key: 'initialPop', label: 'Стартовая популяция', group: 'Популяция', min: 1, max: 2000, step: 1, def: 150, restart: true },
  { key: 'maxPop', label: 'Предел популяции (страховка скорости)', group: 'Популяция', min: 10, max: 10000, step: 10, def: 3000 },

  { key: 'sensorMode', label: 'Зрение', group: 'Мозг', min: 0, max: 1, step: 1, def: 1, type: 'select', options: ['простое: направление на еду', 'глаза-секторы'], restart: true },
  { key: 'sectors', label: 'Число секторов глаз', group: 'Мозг', min: 3, max: 12, step: 1, def: 6, restart: true },
  { key: 'senseNeighbors', label: 'Видят соседей', group: 'Мозг', min: 0, max: 1, step: 1, def: 1, type: 'bool', restart: true },
  { key: 'senseClock', label: 'Чувство времени и сезона', group: 'Мозг', min: 0, max: 1, step: 1, def: 1, type: 'bool', restart: true },
  { key: 'brainType', label: 'Тип мозга', group: 'Мозг', min: 0, max: 1, step: 1, def: 1, type: 'select', options: ['обычный', 'с памятью'], restart: true },
  { key: 'hiddenSize', label: 'Скрытых нейронов', group: 'Мозг', min: 1, max: 32, step: 1, def: 8, restart: true },
  { key: 'visionRadius', label: 'Радиус зрения (базовый)', group: 'Мозг', min: 10, max: 1000, step: 5, def: 120 },

  { key: 'startEnergy', label: 'Стартовая энергия', group: 'Бактерия', min: 1, max: 1000, step: 1, def: 120 },
  { key: 'maxEnergy', label: 'Максимальная энергия (базовая)', group: 'Бактерия', min: 10, max: 2000, step: 1, def: 200 },
  { key: 'metabolism', label: 'Метаболизм (расход за тик)', group: 'Бактерия', min: 0, max: 5, step: 0.005, def: 0.07 },
  { key: 'moveCost', label: 'Стоимость движения (× скорость²)', group: 'Бактерия', min: 0, max: 5, step: 0.005, def: 0.06 },
  { key: 'maxSpeed', label: 'Макс. скорость (базовая)', group: 'Бактерия', min: 0.1, max: 20, step: 0.1, def: 2 },
  { key: 'maxTurn', label: 'Макс. поворот (рад/тик)', group: 'Бактерия', min: 0.01, max: 1.5, step: 0.01, def: 0.2 },
  { key: 'radius', label: 'Радиус (базовый)', group: 'Бактерия', min: 1, max: 30, step: 0.5, def: 5 },
  { key: 'maxAge', label: 'Макс. возраст (базовый)', group: 'Бактерия', min: 100, max: 100000, step: 100, def: 4000 },
  { key: 'ageSpread', label: 'Разброс возраста (0.2 = ±20%)', group: 'Бактерия', min: 0, max: 0.9, step: 0.01, def: 0.2 },
  { key: 'collisions', label: 'Столкновения бактерий', group: 'Бактерия', min: 0, max: 1, step: 1, def: 1, type: 'bool' },

  { key: 'divideFood', label: 'Еды до деления (начальное)', group: 'Деление', min: 1, max: 50, step: 1, def: 3, restart: true },
  { key: 'divideEnergy', label: 'Мин. энергия для деления', group: 'Деление', min: 2, max: 1000, step: 1, def: 50 },
  { key: 'divideCost', label: 'Потери энергии при делении (доля)', group: 'Деление', min: 0, max: 0.9, step: 0.01, def: 0.15 },

  { key: 'evoTraits', label: 'Эволюция черт тела', group: 'Черты тела', min: 0, max: 1, step: 1, def: 1, type: 'bool' },
  { key: 'traitSigma', label: 'Сила мутации черт', group: 'Черты тела', min: 0, max: 0.5, step: 0.005, def: 0.04 },
  { key: 'speedUpkeep', label: 'Цена быстроты (за тик, × скорость²)', group: 'Черты тела', min: 0, max: 1, step: 0.005, def: 0.02 },
  { key: 'visionCost', label: 'Цена зрения (за тик, × зрение²)', group: 'Черты тела', min: 0, max: 1, step: 0.005, def: 0.02 },

  { key: 'mutRate', label: 'Доля мутирующих весов', group: 'Мутации', min: 0, max: 1, step: 0.01, def: 0.1 },
  { key: 'mutSigma', label: 'Сила мутации (σ)', group: 'Мутации', min: 0, max: 2, step: 0.01, def: 0.2 },
  { key: 'mutBig', label: 'Доля полной замены веса', group: 'Мутации', min: 0, max: 1, step: 0.005, def: 0.01 },
  { key: 'hueDrift', label: 'Дрейф цвета семьи', group: 'Мутации', min: 0, max: 0.2, step: 0.005, def: 0.02 },

  { key: 'examInterval', label: 'Экзамен лучших: раз в N тиков (0 — выкл.)', group: 'Статистика', min: 0, max: 200000, step: 1000, def: 10000 },
] as const satisfies readonly ParamDef[];

export type ParamKey = (typeof PARAMS)[number]['key'];
export type Config = Record<ParamKey, number>;

export const paramDef = (key: string): ParamDef | undefined => (PARAMS as readonly ParamDef[]).find((p) => p.key === key);

export function defaultConfig(): Config {
  const c = {} as Config;
  for (const p of PARAMS) c[p.key] = p.def;
  return c;
}

/** Достраивает конфиг из сохранения: неизвестные ключи отбрасываются, новые — по умолчанию. */
export function normalizeConfig(raw: Partial<Record<string, number>> | undefined, base: Config = defaultConfig()): Config {
  const c = { ...base };
  if (raw) for (const p of PARAMS) if (typeof raw[p.key] === 'number') c[p.key] = raw[p.key]!;
  return c;
}

export interface Preset {
  id: string;
  label: string;
  hint: string;
  over: Partial<Config>;
}

/** Готовые наборы параметров. Применяются поверх значений по умолчанию. */
export const PRESETS: Preset[] = [
  { id: 'easy', label: 'Лёгкий', hint: 'Много еды, мягкая зима', over: { foodPerTick: 0.9, seasonAmp: 0.5, toxicCost: 0.15 } },
  { id: 'normal', label: 'Обычный', hint: 'Значения по умолчанию', over: {} },
  { id: 'harsh', label: 'Суровый', hint: 'Меньше еды, жёсткие зимы', over: { foodPerTick: 0.45, seasonAmp: 0.85, maxAge: 3500 } },
  { id: 'famine', label: 'Голод', hint: 'Еды мало, она дорогая', over: { foodPerTick: 0.35, foodEnergy: 35, seasonAmp: 0.9, metabolism: 0.08 } },
  {
    id: 'observe', label: 'Наблюдение', hint: 'Маленькое поле, мало особей — удобно следить',
    over: { fieldW: 700, fieldH: 460, maxFood: 170, foodPerTick: 0.22, initialPop: 50, patchCount: 3, zoneCount: 2, zoneRadius: 90 },
  },
  {
    id: 'classic', label: 'Классика (v1)', hint: 'Как в первой версии: простое зрение, ровная еда, без сезонов и черт',
    over: {
      sensorMode: 0, senseNeighbors: 0, senseClock: 0, brainType: 0, hiddenSize: 6, foodPatches: 0, seasonLength: 0, zones: 0,
      corpseEnergy: 0, collisions: 0, evoTraits: 0, divideCost: 0, visionRadius: 150, metabolism: 0.1, moveCost: 0.08,
      speedUpkeep: 0, visionCost: 0, maxTurn: 0.15, maxAge: 3000, startEnergy: 100, divideEnergy: 60, foodPerTick: 0.5,
      maxFood: 400, initialPop: 60,
    },
  },
];

export function presetConfig(id: string, seed?: number): Config {
  const p = PRESETS.find((x) => x.id === id) ?? PRESETS[1];
  const c = { ...defaultConfig(), ...p.over } as Config;
  if (seed !== undefined) c.seed = seed;
  return c;
}
