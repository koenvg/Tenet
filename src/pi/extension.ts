import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { registerGuard } from './guard.js';
import { registerInspectorCommand } from './inspector-command.js';

export default function tenet(pi: ExtensionAPI): void {
  registerGuard(pi, { onEligible: () => registerInspectorCommand(pi) });
}
