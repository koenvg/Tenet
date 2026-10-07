import { mountSummaryWorkspace } from './library';
import { previewInput, previewSummaries } from './preview-fixture';
const target = document.getElementById('summary-preview')!;
const narrow = new URLSearchParams(location.search).get('container') === '390';
target.style.width = narrow ? '390px' : '100%';
target.style.maxWidth = '100%';
const workspace = mountSummaryWorkspace(target, previewInput);
function update() { workspace.update(previewInput); }
const allCalls = previewInput.model.calls;
previewInput.actions = {
  selectCall(id) {
    const selected = previewSummaries[id];
    if (!selected) return;
    previewInput.model = { ...previewInput.model, selectedId: id, selected };
    update();
  },
  filterCategory(category) { previewInput.model = { ...previewInput.model, category, calls: category ? allCalls.filter(call => call.categories.includes(category)) : allCalls }; update(); },
  refresh() { update(); },
};
update();
