/** Validate raw syntax before URL parsing can normalize a rejected destination. */
export function systemOneOrigin(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 2048) return;
  const match = /^(https?):\/\/(\[[0-9a-fA-F:.]+\]|[A-Za-z0-9.-]+)(?::([0-9]+))?\/?$/.exec(value);
  if (!match) return;
  const [, scheme, host, port] = match;
  if (port !== undefined && (!Number.isInteger(Number(port)) || Number(port) < 1 || Number(port) > 65535)) return;
  if (scheme === 'http' && (!['127.0.0.1', '[::1]'].includes(host!) || port === undefined)) return;
  if (!host!.startsWith('[') && !host!.replace(/\.$/, '').split('.').every(label =>
    label.length <= 63 && /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(label))) return;
  try {
    const url = new URL(value);
    if (url.hostname.toLowerCase() !== host!.toLowerCase()) return;
    return url.origin;
  } catch { return; }
}
