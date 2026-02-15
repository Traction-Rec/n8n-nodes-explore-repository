# API Documentation

## Components

### Button

A simple button component.

```typescript
const button = new Button('Label');
button.render(); // Returns HTML string
```

### Input

A text input component.

```typescript
const input = new Input({ placeholder: 'Enter text...' });
input.render(); // Returns HTML string
```

## Utilities

### formatDate(date: Date): string

Formats a date as YYYY-MM-DD.

### calculateSum(numbers: number[]): number

Calculates the sum of an array of numbers.

### capitalize(str: string): string

Capitalizes the first letter of a string.

### slugify(str: string): string

Converts a string to a URL-friendly slug.
