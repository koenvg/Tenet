import { createRequire } from 'node:module';
import { isInaccessible, within } from '@testing-library/react';
import { expect } from 'vitest';

// This version exposes its declarations through the CommonJS entry point.
const { computeAccessibleName, getRole } = createRequire(import.meta.url)('dom-accessibility-api') as
  typeof import('dom-accessibility-api', { with: { 'resolution-mode': 'require' } });
// Find the plain-text control before computing accessible names across a whole page of rows.
export function getNamedButton(container: HTMLElement, name: string) {
  const button = within(container).getByText(name, { selector: 'button' });
  expect(getRole(button)).toBe('button');
  expect(isInaccessible(button)).toBe(false);
  expect(computeAccessibleName(button)).toBe(name);
  return button;
}
