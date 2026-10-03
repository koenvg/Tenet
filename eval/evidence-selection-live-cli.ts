import { pathToFileURL } from 'node:url';
import type { Fetch } from '@typesafe-ai/sdk';
import { runEvidenceLive } from './evidence-selection-live.js';

export async function runEvidenceLiveCli(args: string[], env: NodeJS.ProcessEnv, fetch?: Fetch) {
  if (args.length !== 2 || new Set(args).size !== 2 || !args.includes('--live') || !args.includes('--authorize-evidence-disclosure')) {
    throw Error('required-exact-flags-live-and-authorize-evidence-disclosure');
  }
  if (!env.TYPESAFE_API_KEY?.trim() || !env.BB_THREAD_STORAGE?.trim()) throw Error('credentials-and-thread-storage-required');
  const controller = new AbortController();
  const abort = () => controller.abort();
  process.on('SIGINT', abort); process.on('SIGTERM', abort);
  try {
    return await runEvidenceLive({ authorized: true, apiKey: env.TYPESAFE_API_KEY, storage: env.BB_THREAD_STORAGE, fetch, signal: controller.signal });
  } finally { process.off('SIGINT', abort); process.off('SIGTERM', abort); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runEvidenceLiveCli(process.argv.slice(2), process.env).then(report => {
    console.log(`Campaign stopped. Spent ${report.accounting.spent}/34; unspent ${report.accounting.unspent}. See fixed tenet29-live output directory.`);
    if (report.stopReason || report.accounting.completed !== 34) process.exitCode = 1;
  }).catch(() => {
    // Never echo SDK, filesystem or arbitrary argument errors into logs.
    console.error('Campaign refused or stopped. No automatic retry. Inspect durable campaign artifacts if reserved.');
    process.exitCode = 1;
  });
}
