import type { Spatial } from '../core/spatial';
import type { Genome } from './genome';

export class Food implements Spatial {
  cell = 0;
  slot = 0;
  /** индекс в world.foods */
  idx = 0;
  constructor(
    public x: number,
    public y: number,
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
  // --- рабочие поля (пересчитываются каждый тик) ---
  thrust = 0;
  seesFood = false;
  foodDist = 0;
  /** угол на еду относительно взгляда, -π..π */
  dAngle = 0;
  foodX = 0;
  foodY = 0;
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
  ) {
    this.inputs = new Float32Array(nIn);
    this.outputs = new Float32Array(nOut);
  }
}
