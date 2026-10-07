import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import ComparisonPreview from './ComparisonPreview.js';
const params = new URLSearchParams(location.search);
createRoot(document.getElementById('comparison-preview')!).render(createElement(ComparisonPreview, {
  panelWidth: params.get('container') === '390' ? 390 : undefined, showRaw: params.get('raw') === '1',
}));
