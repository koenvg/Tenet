import { recordingConfig } from '../recording/archive.js';
import { startInspectorDev } from './dev.js';

const config = recordingConfig(process.env);
if (config.issue) throw new Error(config.issue);
const app = await startInspectorDev({ directory: config.directory });
console.log(`TENET inspector (live reload): ${app.url}\nLocal archive: ${config.directory}`);
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { void app.close(); });
