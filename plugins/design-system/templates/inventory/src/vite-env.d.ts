/// <reference types="vite/client" />

// Without this, `import.meta.glob` (used in data.ts to discover *.examples.tsx) is a type
// error, and importing the generated .json files resolves to `any`.

declare module '*.json' {
  const value: unknown;
  export default value;
}
