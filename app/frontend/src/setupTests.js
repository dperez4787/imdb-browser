import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Vitest runs without injected globals (vite.config.js), so Testing Library's
// automatic afterEach cleanup never registers itself — do it explicitly, or
// each test's tree stays mounted into the next test.
afterEach(() => {
  cleanup();
});
