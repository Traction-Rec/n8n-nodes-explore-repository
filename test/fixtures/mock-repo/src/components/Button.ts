/**
 * A simple Button component
 */
export class Button {
  private label: string;
  private disabled: boolean;

  constructor(label: string, disabled: boolean = false) {
    this.label = label;
    this.disabled = disabled;
  }

  public render(): string {
    const disabledAttr = this.disabled ? ' disabled' : '';
    return `<button${disabledAttr}>${this.label}</button>`;
  }

  public setLabel(label: string): void {
    this.label = label;
  }

  public getLabel(): string {
    return this.label;
  }

  public enable(): void {
    this.disabled = false;
  }

  public disable(): void {
    this.disabled = true;
  }
}

export function createButton(label: string): Button {
  return new Button(label);
}
