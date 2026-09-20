import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { registerGuard } from './guard.js';

export default function tenet(pi: ExtensionAPI): void {
  registerGuard(pi);
}
