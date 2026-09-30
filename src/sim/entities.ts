import type { Spatial } from '../core/spatial';
import type { Genome } from './genome';
import { neutralFingerprint } from './behavior';

export class Food implements Spatial {
  cell = 0;
  slot = 0;
  /** индекс в world.foods */
  idx = 0;
  constructor(
    public x: number,
    public y: number,
    /** энергия */
    public e: number,
    /** индекс куста или -1 */
    public patch = -1,
  ) {}
}

export class Bacterium {
  // --- состояние, которое сохраняется ---
  energy = 0;
  age = 0;
  eaten = 0;
  eatenSince = 0;
  children = 0;
  angle = 0;
  /** поведенческий отпечаток (см. behavior.ts) */
  fp: Float32Array;
  // --- классификация (пересчитывается рекордером) ---
  type = 4;
  strategy = '';
  // --- рабочие поля (пересчитываются каждый тик) ---
  thrust = 0;
  turn = 0;
  speedNow = 0;
  seesFood = false;
  foodDist = 0;
  /** угол на ближайшую еду относительно взгляда, -π..π */
  dAngle = 0;
  foodX = 0;
  foodY = 0;
  foodCount = 0;
  crowd = 0;
  /** зона, в которой бактерия сейчас (-1 — обычная местность) */
  zone = -1;
  /** сектора глаз: еда и соседи */
  sFood: Float32Array;
  sPeer: Float32Array;
  readonly inputs: Float32Array;
  readonly outputs: Float32Array;

  constructor(
    readonly id: number,
    readonly parentId: number,
    readonly generation: number,
    readonly lineage: number,
    public x: number,
    public y: number,
    public maxAge: number,
    readonly genome: Genome,
    nIn: number,
    nOut: number,
    sectors: number,
  ) {
    this.inputs = new Float32Array(nIn);
    this.outputs = new Float32Array(nOut);
    this.sFood = new Float32Array(sectors);
    this.sPeer = new Float32Array(sectors);
    this.fp = neutralFingerprint();
  }
}
