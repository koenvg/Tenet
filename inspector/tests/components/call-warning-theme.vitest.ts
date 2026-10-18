import { createElement, type CSSProperties } from 'react';
import { expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import SummaryWorkspace from '../../src/shared/SummaryWorkspace.js';
import type { SummaryCall } from '../../src/shared/model.js';
import '../../src/components.css';

const themes = {
  light: { warning: 'rgb(121, 86, 23)', background: 'rgb(255, 255, 255)', muted: 'rgb(239, 240, 237)', foreground: 'rgb(23, 25, 24)' },
  dark: { warning: 'rgb(250, 204, 21)', background: 'rgb(24, 24, 27)', muted: 'rgb(39, 39, 42)', foreground: 'rgb(244, 244, 245)' },
};

function luminance(color: string) {
  const channels = color.match(/[\d.]+/g)!.slice(0, 3).map(value => {
    const channel = Number(value) / 255;
    return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
  });
  return channels[0]! * .2126 + channels[1]! * .7152 + channels[2]! * .0722;
}

function backgroundBehind(element: Element): string {
  const background = getComputedStyle(element).backgroundColor;
  if (background !== 'rgba(0, 0, 0, 0)' && background !== 'transparent') return background;
  if (!element.parentElement) throw new Error('Warning has no opaque background');
  return backgroundBehind(element.parentElement);
}

for (const [theme, colors] of Object.entries(themes)) {
  for (const width of [390, 1280]) {
    test(`${theme} ${width}px call warnings use the host warning color with readable contrast`, async () => {
      await page.viewport(width, 1000);
      const base: SummaryCall = { id: 'pass', callId: 'synthetic-pass', toolName: 'bash', timestamp: 60000,
        mode: 'observe', decision: 'ALLOW', permission: 'released', execution: 'executed',
        categories: [], missing: [], assessmentStatus: 'completed', failure: null };
      const calls: SummaryCall[] = [base, ...['selected-failure', 'other-failure'].map(id => ({
        ...base, id, callId: id, decision: 'BLOCK', categories: ['unavailable'] as SummaryCall['categories'],
        assessmentStatus: 'unavailable', failure: 'provider-error',
      }))];
      const original = structuredClone(calls);
      const coverage = '3 exact-linked calls. Best-effort capture, not complete coverage.';
      const screen = await render(createElement('div', { style: {
        '--warning-text': colors.warning, '--background': colors.background, '--muted': colors.muted,
        '--foreground': colors.foreground, '--muted-foreground': colors.foreground,
        background: colors.background,
      } as CSSProperties }, createElement(SummaryWorkspace, {
        variant: 'calls',
        model: { calls, selected: null, selectedId: 'selected-failure', category: '', coverage, loading: false, error: '' },
        actions: { selectCall() {}, filterCategory() {}, refresh() {} },
      })));
      await expect.element(screen.getByText(coverage, { exact: true })).toBeVisible();
      expect(screen.container.querySelector('[data-call-id="pass"] .call-concern')).toBeNull();
      expect(screen.container.querySelectorAll('.call-concern')).toHaveLength(2);
      for (const id of ['selected-failure', 'other-failure']) {
        const row = screen.container.querySelector<HTMLElement>(`[data-call-id="${id}"]`)!;
        const warning = row.querySelector<HTMLElement>('.call-concern.caution')!;
        await expect.element(warning).toBeVisible();
        expect(warning.textContent).toBe('Evaluator unavailable');
        expect(warning.title).toBe('Evaluator unavailable');
        expect(row.textContent).toContain('Ran');
        expect(row.textContent).not.toContain('Suspected violation');
        const foreground = getComputedStyle(warning).color;
        expect(foreground).toBe(colors.warning);
        const a = luminance(foreground), b = luminance(backgroundBehind(warning));
        expect((Math.max(a, b) + .05) / (Math.min(a, b) + .05)).toBeGreaterThanOrEqual(4.5);
      }
      expect(calls).toEqual(original);
      await page.screenshot({ path: `../../../coverage/inspector-artifacts/call-warning-${theme}-${width}.png` });
      await screen.unmount();
    });
  }
}
