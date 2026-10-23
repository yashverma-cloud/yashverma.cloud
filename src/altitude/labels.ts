/**
 * HTML labels on a drawing: each hangs from a projected world point on a hairline leader, in
 * the data face. Created on first use, updated without layout reads inside the frame (heights
 * are read once per resize).
 */
import type { LabelState } from './engine/scene';

interface Projector {
  project(p: [number, number, number], out: { x: number; y: number; visible: boolean }): void;
}

interface Entry {
  el: HTMLElement;
  text: HTMLElement;
  tick: HTMLElement;
  line: SVGLineElement;
  shown: number;
}

export class LabelLayer {
  private readonly entries = new Map<string, Entry>();
  private readonly pt = { x: 0, y: 0, visible: false };
  private half = 10;

  constructor(
    private readonly box: HTMLElement,
    private readonly svg: SVGSVGElement,
  ) {
    window.addEventListener('resize', () => this.measure());
  }

  private entry(id: string): Entry {
    let e = this.entries.get(id);
    if (!e) {
      const el = document.createElement('p');
      el.className = 'label';
      el.dataset.label = id;
      const text = document.createElement('span');
      const tick = document.createElement('span');
      tick.className = 'tick';
      el.append(text, ' ', tick);
      this.box.appendChild(el);
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      this.svg.appendChild(line);
      e = { el, text, tick, line, shown: -1 };
      this.entries.set(id, e);
      if (this.entries.size === 1) this.measure();
    }
    return e;
  }

  private measure(): void {
    const first = this.entries.values().next().value;
    if (first) this.half = first.el.offsetHeight / 2 || 10;
  }

  /** Places every label for this frame; `scale` shrinks the offsets on small screens. */
  update(states: LabelState[], projector: Projector, scale = 1): void {
    for (const s of states) {
      const e = this.entry(s.id);
      if (s.show <= 0.001) {
        if (e.shown !== 0) {
          e.el.style.opacity = '0';
          e.line.style.opacity = '0';
          e.shown = 0;
        }
        continue;
      }
      projector.project(s.anchor, this.pt);
      if (!this.pt.visible) {
        e.el.style.opacity = '0';
        e.line.style.opacity = '0';
        e.shown = 0;
        continue;
      }
      if (e.text.textContent !== s.text) e.text.textContent = s.text;
      const tick = s.tick ?? '';
      if (e.tick.textContent !== tick) e.tick.textContent = tick;
      if (!!s.amber !== e.el.hasAttribute('data-amber')) e.el.toggleAttribute('data-amber', !!s.amber);
      const lx = this.pt.x + s.dx * scale;
      const ly = this.pt.y + s.dy * scale;
      e.el.style.opacity = String(s.show);
      e.el.style.transform = `translate3d(${s.dx < 0 ? `calc(${lx}px - 100%)` : `${lx}px`}, ${ly - this.half}px, 0)`;
      e.line.setAttribute('x1', String(this.pt.x));
      e.line.setAttribute('y1', String(this.pt.y));
      e.line.setAttribute('x2', String(s.dx < 0 ? lx + 6 : lx - 6));
      e.line.setAttribute('y2', String(ly));
      e.line.style.opacity = String(s.show);
      e.shown = s.show;
    }
  }

  hideAll(): void {
    for (const e of this.entries.values()) {
      e.el.style.opacity = '0';
      e.line.style.opacity = '0';
      e.shown = 0;
    }
  }
}
