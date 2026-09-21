import { fileURLToPath } from 'node:url';
import { recordingConfig } from '../recording/archive.js';
import { startInspector } from './server.js';

const config = recordingConfig(process.env);
if (config.issue) throw new Error(config.issue);
const app = await startInspector({ directory: config.directory, assets: fileURLToPath(new URL('../../inspector/dist', import.meta.url)) });
console.log(`TENET inspector: ${app.url}\nLocal archive: ${config.directory}`);
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { void app.close(); });
