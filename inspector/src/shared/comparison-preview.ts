import { mount } from 'svelte';
import ComparisonPreview from './ComparisonPreview.svelte';
const params = new URLSearchParams(location.search);
mount(ComparisonPreview, {
  target: document.getElementById('comparison-preview')!,
  props: { panelWidth: params.get('container') === '390' ? 390 : undefined, showRaw: params.get('raw') === '1' },
});
