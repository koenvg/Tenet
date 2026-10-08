import { createElement } from 'react';
import '../../src/components.css';
import '../../../web/theme.css';
import { expect, test } from 'vitest';
import { render } from 'vitest-browser-react';
import RecordedData from '../../src/RecordedData.js';
import { makeView } from './fixtures.js';

test('renders retained exact records inside disposable Chromium', async () => {
  const screen = await render(createElement(RecordedData, { view: makeView() }));
  await screen.getByText('Exact rule records and captured questions', { exact: true }).click();
  await expect.element(screen.getByRole('region', { name: 'Exact rule records and captured questions' })).toBeVisible();
});

import '../../src/style.css';
import '../../src/summary.css';
