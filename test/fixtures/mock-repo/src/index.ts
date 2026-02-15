/* eslint-disable no-console */
/**
 * Main entry point for the mock application
 */
import { Button } from './components/Button';
import { formatDate, calculateSum } from './utils/helpers';

export function main(): void {
  console.log('Hello from mock repo!');
  const button = new Button('Click me');
  button.render();
  
  const today = formatDate(new Date());
  console.log(`Today is: ${today}`);
  
  const sum = calculateSum([1, 2, 3, 4, 5]);
  console.log(`Sum: ${sum}`);
}

export { Button } from './components/Button';
export { formatDate, calculateSum } from './utils/helpers';
