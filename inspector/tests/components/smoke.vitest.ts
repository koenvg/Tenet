import { expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import SafeMarkdown from '../../src/SafeMarkdown.svelte';

test('renders a Svelte component inside disposable Chromium', async () => {
  const screen = await render(SafeMarkdown, { source: '**Recorded instruction**' });
  await expect.element(screen.getByText('Recorded instruction')).toBeVisible();
});
