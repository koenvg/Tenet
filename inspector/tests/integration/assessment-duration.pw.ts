import { mkdir } from 'node:fs/promises';
import { expect, test } from '../playwright-fixture.js';
import { FixtureArchiveWriter } from '../../../test/archive-fixture.js';
import { readArchive, recordInvocationKey, recordSessionKey } from '../../../src/recording/archive.js';
import { reveal } from '../ui-navigation.js';


const identity = { sessionId: 'assessment-duration', invocationId: 'timed-call', callId: 'timed-call',
  toolName: 'read', cwd: '/synthetic', mode: 'observe' as const };
const hostIdentity = { ...identity, host: 'pi', contextId: 'main' };

for (const schema of [1, 2, 3, 4, 5] as const) {
  for (const duration of schema < 3 ? [undefined] : [1475, 0, undefined]) {
    test(`schema ${schema} labels assessment duration ${duration ?? 'unknown'} without claiming provider latency`, async ({ withInspector }) => {
      const address = { ...(schema === 1 ? identity : hostIdentity), schemaVersion: schema };
      const path = `/?session=${recordSessionKey(address)}&invocation=${recordInvocationKey(address)}`;
      const status = { status: 'unavailable', reason: 'provider-error', queueWaitMs: 42,
        ...(duration === undefined ? {} : { providerDurationMs: duration }) };
      await withInspector(`assessment-duration-${schema}-${duration ?? 'unknown'}`, async ({ page, directory }) => {
        await page.locator('.invocation').waitFor();
        await reveal(page, '.recorded-disclosure');
        await reveal(page, '.recording-details');
        const metadata = page.getByRole('region', { name: 'Recording metadata', exact: true });
        const durationRow = metadata.locator('.record-fields > div').filter({
          has: page.locator('dt', { hasText: /^Assessment duration$/ }),
        });
        await metadata.waitFor({ state: 'visible' });
        expect(await durationRow.count()).toBe(1);
        expect(await durationRow.locator('dd').textContent()).toBe(schema < 3 || duration === undefined ? 'unknown' : `${duration} ms`);
        expect(await metadata.getByText('Provider duration', { exact: true }).count()).toBe(0);
        expect(await metadata.getByText('Elapsed time for the assessment call, including evidence preparation, judge execution and validation. This is not isolated provider latency. Queue wait is separate.', { exact: true }).isVisible()).toBe(true);
        expect(await metadata.locator('.record-fields > div').filter({ has: page.locator('dt', { hasText: /^Queue wait$/ }) }).locator('dd').textContent()).toBe(schema < 3 ? 'unknown' : '42 ms');
        if (schema === 5 && duration === 1475) {
          await mkdir('coverage/inspector-artifacts', { recursive: true });
          await metadata.screenshot({ path: 'coverage/inspector-artifacts/assessment-duration-desktop.png' });
        }
        await page.setViewportSize({ width: 390, height: 844 });
        expect(await durationRow.isVisible()).toBe(true);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        if (schema === 5 && duration === 1475) await metadata.screenshot({ path: 'coverage/inspector-artifacts/assessment-duration-mobile.png' });
        const archive = await readArchive(directory);
        expect(archive.issues).toEqual([]);
        const stored = archive.records.find(record => record.stage === 'assessment-status')?.data;
        if (schema < 3) expect(stored).toBeUndefined();
        else {
          expect(stored).toMatchObject(status);
          expect(Object.hasOwn(stored!, 'providerDurationMs')).toBe(duration !== undefined);
        }
      }, { base: false, path, seed: async directory => {
        const writer = new FixtureArchiveWriter({ enabled: true, directory });
        const sink = schema === 1 ? writer.bindHistorical(identity, 1)
          : schema === 2 ? writer.bindHistorical(hostIdentity, 2)
          : schema === 5 ? writer.bind(hostIdentity) : writer.bindHistorical(hostIdentity, schema);
        // A decision duration must not fill in an absent lifecycle measurement.
        sink('decision', { decision: 'BLOCK', reason: 'provider-error', durationMs: 9999 });
        if (schema >= 3) sink('assessment-status', status);
        await writer.complete();
      } });
    });
  }
}
