import type { Bacterium } from '../sim/entities';
import type { World } from '../sim/world';

export type ColorMode = 'lineage' | 'energy' | 'generation';

export interface DrawOpts {
  color: ColorMode;
  vision: boolean;
  selected: Bacterium | null;
}

/** Рисует поле на canvas; хранит камеру (масштаб и сдвиг). */
export class Renderer {
  scale = 1;
  ox = 0;
  oy = 0;
  /** пользователь двигал камеру — не пересобирать «вписать в окно» */
  userMoved = false;
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  cw = 0;
  ch = 0;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
  }

  resize(fieldW: number, fieldH: number): void {
    const r = this.canvas.parentElement!.getBoundingClientRect();
    this.dpr = window.devicePixelRatio || 1;
    this.cw = Math.max(50, r.width);
    this.ch = Math.max(50, r.height);
    this.canvas.width = Math.round(this.cw * this.dpr);
    this.canvas.height = Math.round(this.ch * this.dpr);
    this.canvas.style.width = `${this.cw}px`;
    this.canvas.style.height = `${this.ch}px`;
    if (!this.userMoved) this.fit(fieldW, fieldH);
  }

  fit(fieldW: number, fieldH: number): void {
    const pad = 16;
    this.scale = Math.min((this.cw - pad * 2) / fieldW, (this.ch - pad * 2) / fieldH);
    this.ox = (this.cw - fieldW * this.scale) / 2;
    this.oy = (this.ch - fieldH * this.scale) / 2;
    this.userMoved = false;
  }

  toWorld(sx: number, sy: number): [number, number] {
    return [(sx - this.ox) / this.scale, (sy - this.oy) / this.scale];
  }

  zoomAt(sx: number, sy: number, factor: number): void {
    const [wx, wy] = this.toWorld(sx, sy);
    this.scale = Math.min(20, Math.max(0.1, this.scale * factor));
    this.ox = sx - wx * this.scale;
    this.oy = sy - wy * this.scale;
    this.userMoved = true;
  }

  panBy(dx: number, dy: number): void {
    this.ox += dx;
    this.oy += dy;
    this.userMoved = true;
  }

  centerOn(wx: number, wy: number): void {
    this.ox = this.cw / 2 - wx * this.scale;
    this.oy = this.ch / 2 - wy * this.scale;
    this.userMoved = true;
  }

  draw(world: World, o: DrawOpts): void {
    const { ctx, dpr, scale } = this;
    const cfg = world.cfg;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0b0e14';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * this.ox, dpr * this.oy);

    ctx.fillStyle = '#121824';
    ctx.fillRect(0, 0, cfg.fieldW, cfg.fieldH);
    ctx.lineWidth = 2 / scale;
    ctx.strokeStyle = '#2f3a4f';
    ctx.strokeRect(0, 0, cfg.fieldW, cfg.fieldH);

    // еда
    ctx.fillStyle = '#5fcf80';
    ctx.beginPath();
    const fr = cfg.foodRadius;
    for (const f of world.foods) {
      ctx.moveTo(f.x + fr, f.y);
      ctx.arc(f.x, f.y, fr, 0, Math.PI * 2);
    }
    ctx.fill();

    // линии зрения
    if (o.vision) {
      ctx.strokeStyle = 'rgba(95,207,128,0.35)';
      ctx.lineWidth = 1 / scale;
      ctx.beginPath();
      for (const b of world.bacteria) {
        if (!b.seesFood) continue;
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(b.foodX, b.foodY);
      }
      ctx.stroke();
    }

    // бактерии
    const R = cfg.radius;
    for (const b of world.bacteria) {
      ctx.fillStyle = this.colorOf(b, o.color, cfg.maxEnergy, world.totals.maxGen);
      ctx.beginPath();
      ctx.arc(b.x, b.y, R, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = Math.max(1, 1.2 / scale);
    ctx.beginPath();
    for (const b of world.bacteria) {
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x + Math.cos(b.angle) * R * 1.5, b.y + Math.sin(b.angle) * R * 1.5);
    }
    ctx.stroke();

    // выбранная
    const s = o.selected;
    if (s) {
      ctx.lineWidth = 2 / scale;
      ctx.strokeStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(s.x, s.y, R + 4 / scale, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([4 / scale, 4 / scale]);
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.beginPath();
      ctx.arc(s.x, s.y, cfg.visionRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      if (s.seesFood) {
        ctx.strokeStyle = '#ffd166';
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.foodX, s.foodY);
        ctx.stroke();
      }
    }
  }

  private colorOf(b: Bacterium, mode: ColorMode, maxEnergy: number, maxGen: number): string {
    switch (mode) {
      case 'energy':
        return `hsl(${Math.round(Math.min(1, Math.max(0, b.energy / maxEnergy)) * 120)} 75% 52%)`;
      case 'generation': {
        const t = maxGen > 0 ? b.generation / maxGen : 0;
        return `hsl(${Math.round(230 - t * 230)} 75% 55%)`;
      }
      default:
        return `hsl(${Math.round(b.genome.hue * 360)} 70% 58%)`;
    }
  }

  /** Ближайшая бактерия к точке экрана (или null). */
  pick(world: World, sx: number, sy: number): Bacterium | null {
    const [wx, wy] = this.toWorld(sx, sy);
    const reach = Math.max(world.cfg.radius * 1.6, 10 / this.scale);
    let best: Bacterium | null = null;
    let bd = reach * reach;
    for (const b of world.bacteria) {
      const d = (b.x - wx) ** 2 + (b.y - wy) ** 2;
      if (d < bd) {
        bd = d;
        best = b;
      }
    }
    return best;
  }
}
