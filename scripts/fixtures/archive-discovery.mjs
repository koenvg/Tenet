import assert from 'node:assert/strict';
import { DefaultResourceLoader, SettingsManager } from '@earendil-works/pi-coding-agent';
const cwd = process.cwd(), agentDir = process.env.PI_CODING_AGENT_DIR;
const loader = new DefaultResourceLoader({ cwd, agentDir, settingsManager: SettingsManager.create(cwd, agentDir),
  noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true });
await loader.reload();
assert.deepEqual(loader.getExtensions().errors, []);
assert.equal(loader.getExtensions().extensions.length, Number(process.argv[2]));
console.log(`Fresh Pi process discovers ${process.argv[2]} registered extension(s).`);
