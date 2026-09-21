import type { ExtensionAPI, ExtensionContext, ExtensionEvent } from '@earendil-works/pi-coding-agent';
import type { Mode } from './config.js';

type Handler = (event: ExtensionEvent, ctx: ExtensionContext) => unknown;

/** Last-resort host boundary: Pi turns a thrown tool_call error into a veto. */
export class GuardBoundary {
  failures = 0;
  readonly on: ExtensionAPI['on'];

  constructor(pi: ExtensionAPI, readonly mode: Mode) {
    // Erase only the overloaded subscription signature; callers retain Pi's event typing.
    const subscribe = pi.on.bind(pi) as (name: ExtensionEvent['type'], handler: Handler) => void;
    this.on = ((name: ExtensionEvent['type'], handler: Handler) => subscribe(name, async (event, ctx) => {
      try { return await handler(event, ctx); }
      catch (error) { return this.failed(error); }
    })) as ExtensionAPI['on'];
  }

  attempt(work: () => void): void {
    try { work(); } catch (error) { this.failed(error); }
  }

  private failed(error: unknown): undefined {
    this.failures++;
    if (this.mode === 'enforce') throw error;
    return undefined;
  }
}
