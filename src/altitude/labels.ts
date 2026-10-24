/**
 * HTML labels on a drawing: each hangs from a projected world point on a hairline leader, in
 * the data face. Created on first use, updated without layout reads inside the frame (sizes
 * are read once per resize; the face is monospaced, so a label's width is its length times one
 * advance). Every label stays inside the layer: one that would run off a side moves to the
 * other side of its anchor, or is held at the margin; one that would cover an earlier label
 * steps down below it; one whose anchor is off screen is hidden.
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

/** Clear space kept between a label and the layer's edge, and between two labels. */
const MARGIN = 12;
const GAP = 4;

export class LabelLayer {
  private readonly entries = new Map<string, Entry>();
  private readonly pt = { x: 0, y: 0, visible: false };
  private half = 10;
  private advance = 8;
  private width = 0;
  private height = 0;
  private readonly placed: { l: number; r: number; t: number; b: number }[] = [];

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
    this.width = this.box.clientWidth;
    this.height = this.box.clientHeight;
    const first = this.entries.values().next().value;
    if (!first) return;
    this.half = first.el.offsetHeight / 2 || 10;
    const cs = getComputedStyle(first.el);
    const ctx = document.createElement('canvas').getContext('2d');
    if (!ctx) return;
    ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    this.advance = ctx.measureText('0').width + (parseFloat(cs.letterSpacing) || 0);
  }

  /** Places every label for this frame; `scale` shrinks the offsets on small screens. */
  update(states: LabelState[], projector: Projector, scale = 1): void {
    this.placed.length = 0;
    if (this.width === 0) this.measure();
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
      if (!this.pt.visible || this.pt.x < 0 || this.pt.x > this.width || this.pt.y < 0 || this.pt.y > this.height) {
        e.el.style.opacity = '0';
        e.line.style.opacity = '0';
        e.shown = 0;
        continue;
      }
      if (e.text.textContent !== s.text) e.text.textContent = s.text;
      const tick = s.tick ?? '';
      if (e.tick.textContent !== tick) e.tick.textContent = tick;
      if (!!s.amber !== e.el.hasAttribute('data-amber')) e.el.toggleAttribute('data-amber', !!s.amber);
      const w = (s.text.length + (tick ? tick.length + 1 : 0)) * this.advance;
      const off = Math.abs(s.dx) * scale;
      const fits = (left: number) => left >= MARGIN && left + w <= this.width - MARGIN;
      const right = this.pt.x + off;
      const leftOf = this.pt.x - off - w;
      let left = s.dx < 0 ? leftOf : right;
      if (!fits(left)) {
        const other = s.dx < 0 ? right : leftOf;
        left = fits(other) ? other : Math.min(Math.max(left, MARGIN), this.width - MARGIN - w);
      }
      let top = Math.min(Math.max(this.pt.y + s.dy * scale - this.half, MARGIN), this.height - MARGIN - 2 * this.half);
      for (let moved = true, n = 0; moved && n <= this.placed.length; n++) {
        moved = false;
        for (const b of this.placed) {
          if (left < b.r + GAP && left + w > b.l - GAP && top < b.b + GAP && top + 2 * this.half > b.t - GAP) {
            top = b.b + GAP;
            moved = true;
          }
        }
      }
      this.placed.push({ l: left, r: left + w, t: top, b: top + 2 * this.half });
      const onRight = left + w / 2 >= this.pt.x;
      e.el.style.opacity = String(s.show);
      e.el.style.transform = `translate3d(${left}px, ${top}px, 0)`;
      e.line.setAttribute('x1', String(this.pt.x));
      e.line.setAttribute('y1', String(this.pt.y));
      e.line.setAttribute('x2', String(onRight ? left - 6 : left + w + 6));
      e.line.setAttribute('y2', String(top + this.half));
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
