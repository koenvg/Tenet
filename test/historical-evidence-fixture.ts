// Historical selector tests use the same explicit frozen-contract boundary as offline replay.
// Normal provider tests must use scoped preparation and actual scripted submissions.
export { boundHistoricalEvidence } from '../eval/evidence-selection-history.js';
