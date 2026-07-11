import type { ImportedPet, PetStateId } from "./types";

export const PET_STATES: Record<
  PetStateId,
  { row: number; label: string; labelEn: string; durations: number[] }
> = {
  idle: { row: 0, label: "待机", labelEn: "Idle", durations: [280, 110, 110, 140, 140, 320] },
  "running-right": {
    row: 1,
    label: "向右",
    labelEn: "Run right",
    durations: [120, 120, 120, 120, 120, 120, 120, 220],
  },
  "running-left": {
    row: 2,
    label: "向左",
    labelEn: "Run left",
    durations: [120, 120, 120, 120, 120, 120, 120, 220],
  },
  waving: { row: 3, label: "挥手", labelEn: "Wave", durations: [140, 140, 140, 280] },
  jumping: { row: 4, label: "跳跃", labelEn: "Jump", durations: [140, 140, 140, 140, 280] },
  failed: {
    row: 5,
    label: "失落",
    labelEn: "Failed",
    durations: [140, 140, 140, 140, 140, 140, 140, 240],
  },
  waiting: { row: 6, label: "等待", labelEn: "Wait", durations: [150, 150, 150, 150, 150, 260] },
  running: { row: 7, label: "工作", labelEn: "Work", durations: [120, 120, 120, 120, 120, 220] },
  review: { row: 8, label: "检查", labelEn: "Review", durations: [150, 150, 150, 150, 150, 280] },
};

export class SpritePlayer {
  private timer: number | undefined;
  private frame = 0;
  private state: PetStateId = "idle";
  private readonly reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  constructor(
    private readonly element: HTMLElement,
    private readonly pet: ImportedPet,
    private readonly scale: number,
  ) {
    element.style.width = `${pet.cellWidth * scale}px`;
    element.style.height = `${pet.cellHeight * scale}px`;
    element.style.backgroundImage = `url("${pet.spriteDataUrl}")`;
    element.style.backgroundRepeat = "no-repeat";
    element.style.backgroundSize = `${pet.width * scale}px ${pet.height * scale}px`;
    element.style.imageRendering = "auto";
    this.setState("idle");
  }

  setState(state: PetStateId, returnToIdle = false) {
    this.stop();
    this.state = state;
    this.frame = 0;
    this.draw(PET_STATES[state].row, 0);
    if (!this.reducedMotion) this.schedule(returnToIdle);
  }

  setLookDirection(degrees: number) {
    if (this.pet.rows < 11) return;
    this.stop();
    const index = Math.round(((degrees % 360) + 360) % 360 / 22.5) % 16;
    this.draw(index < 8 ? 9 : 10, index % 8);
  }

  destroy() {
    this.stop();
  }

  private schedule(returnToIdle: boolean) {
    const definition = PET_STATES[this.state];
    this.timer = window.setTimeout(() => {
      this.frame += 1;
      if (this.frame >= definition.durations.length) {
        if (returnToIdle) {
          this.setState("idle");
          return;
        }
        this.frame = 0;
      }
      this.draw(definition.row, this.frame);
      this.schedule(returnToIdle);
    }, definition.durations[this.frame]);
  }

  private draw(row: number, column: number) {
    this.element.style.backgroundPosition = `${-column * this.pet.cellWidth * this.scale}px ${-row * this.pet.cellHeight * this.scale}px`;
  }

  private stop() {
    if (this.timer !== undefined) window.clearTimeout(this.timer);
    this.timer = undefined;
  }
}
