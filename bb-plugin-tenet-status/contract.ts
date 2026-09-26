import { defineRpcContract } from '@get-bb/plugin-sdk';
import { z } from 'zod';

export const threadIdSchema = z.string().regex(/^thr_[a-z0-9]{8,64}$/);
const request = z.object({ threadId: threadIdSchema }).strict();
export const statusSchema = z.object({ coverage: z.enum(['unknown', 'partial', 'unavailable']), linkedCalls: z.number().int().nonnegative(),
  failures: z.number().int().nonnegative(), issues: z.array(z.string()).max(20) }).strict();
export type Status = z.infer<typeof statusSchema>;
export const unavailable = (): Status => ({ coverage: 'unavailable', linkedCalls: 0, failures: 0, issues: ['host-or-archive-unavailable'] });
export const hostContract = defineRpcContract({ readStatus: { input: z.object({ ...request.shape,
  recordingDirectory: z.string().max(4096).optional() }).strict(), output: statusSchema } });
export const rpcContract = defineRpcContract({ status: { input: request, output: statusSchema } });
