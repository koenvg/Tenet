import { createElement } from 'react';
import '../../src/components.css';
import '../../../web/theme.css';
import { expect, test } from 'vitest';
import { render } from 'vitest-browser-react';
import SafeMarkdown from "../../src/SafeMarkdown.js";

test('renders a React component inside disposable Chromium', async () => {
  const screen = await render(createElement(SafeMarkdown, { source: '**Recorded instruction**' }));
  await expect.element(screen.getByText('Recorded instruction')).toBeVisible();
});
