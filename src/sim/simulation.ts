import { type Config } from '../core/config';
import { Recorder, type RecorderJSON } from '../stats/recorder';
import { World, type WorldJSON } from './world';

/** Мир + рекордер статистики. Это единственная точка входа для UI и тестов. */
export class Simulation {
  world: World;
  readonly recorder = new Recorder();

  constructor(world: World, recorderJSON?: RecorderJSON) {
    this.world = world;
    if (recorderJSON) this.recorder.restore(recorderJSON);
    this.recorder.attach(world);
    if (!this.recorder.history.length) this.recorder.sample();
  }

  static create(cfg: Config): Simulation {
    return new Simulation(World.create(cfg));
  }

  get ended(): boolean {
    return this.world.extinct;
  }

  step(): void {
    if (this.world.extinct) return;
    this.world.tick();
    if (this.world.time % this.recorder.history.interval === 0) this.recorder.sample();
  }

  run(ticks: number): void {
    for (let i = 0; i < ticks && !this.world.extinct; i++) this.step();
  }

  toJSON(): { world: WorldJSON; recorder: RecorderJSON } {
    return { world: this.world.toJSON(), recorder: this.recorder.toJSON() };
  }

  static fromJSON(j: { world: WorldJSON; recorder: RecorderJSON }): Simulation {
    return new Simulation(World.fromJSON(j.world), j.recorder);
  }
}
