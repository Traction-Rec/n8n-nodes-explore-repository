# Mock Repository

This is a mock repository used for testing the Explore Repository n8n node.

## Structure

```
mock-repo/
├── src/
│   ├── components/
│   │   ├── Button.ts
│   │   └── Input.ts
│   ├── utils/
│   │   ├── helpers.ts
│   │   └── constants.ts
│   └── index.ts
├── docs/
│   └── README.md
└── package.json
```

## Features

- TypeScript components
- Utility functions
- Constants and configuration

## Usage

```typescript
import { Button, formatDate } from 'mock-repo';

const btn = new Button('Click me');
console.log(btn.render());
```
