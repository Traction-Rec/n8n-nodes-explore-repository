/**
 * A simple Input component
 */
export interface InputProps {
  placeholder?: string;
  type?: 'text' | 'password' | 'email' | 'number';
  value?: string;
}

export class Input {
  private props: InputProps;

  constructor(props: InputProps = {}) {
    this.props = {
      type: 'text',
      placeholder: '',
      value: '',
      ...props,
    };
  }

  public render(): string {
    const { type, placeholder, value } = this.props;
    return `<input type="${type}" placeholder="${placeholder}" value="${value}" />`;
  }

  public setValue(value: string): void {
    this.props.value = value;
  }

  public getValue(): string {
    return this.props.value || '';
  }
}

export function createInput(props?: InputProps): Input {
  return new Input(props);
}
