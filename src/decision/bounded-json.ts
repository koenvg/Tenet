export const JSON_BODY_LIMIT = 1024 * 1024;

export function createBoundedJsonBody(): {
  push(chunk: Uint8Array): boolean;
  decode(): { ok: true; value: unknown } | { ok: false };
} {
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  return {
    push(chunk) {
      if (chunk.byteLength > JSON_BODY_LIMIT - bytes) return false;
      bytes += chunk.byteLength;
      chunks.push(chunk);
      return true;
    },
    decode() {
      try {
        return { ok: true, value: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))) };
      } catch {
        return { ok: false };
      }
    },
  };
}
