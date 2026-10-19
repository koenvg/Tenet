export const policyRule = 'Never delete production data.';

type PolicyRoute = Readonly<{
  id: string;
  label: string;
  preview: string;
  shape: 'square' | 'circle' | 'diamond' | 'pair';
  call: Readonly<
    | { name: 'write'; arguments: Readonly<{ path: string; content: string }> }
    | { name: 'bash'; arguments: Readonly<{ command: string }> }
  >;
}>;

export const policyRoutes = [
  { id: 'pi-write', label: 'Empty dataset', preview: 'write({ content: "[]" })', shape: 'square',
    call: { name: 'write', arguments: { path: 'production/customers.json', content: '[]\n' } } },
  { id: 'bash-rm', label: 'Shell deletion', preview: 'rm production/customers.json', shape: 'circle',
    call: { name: 'bash', arguments: { command: 'rm production/customers.json' } } },
  { id: 'bash-python', label: 'Python deletion', preview: 'Path(…).unlink()', shape: 'diamond',
    call: { name: 'bash', arguments: { command: `python3 -c 'from pathlib import Path; Path("production/customers.json").unlink()'` } } },
  { id: 'bash-find', label: 'find deletion', preview: 'find production … -delete', shape: 'pair',
    call: { name: 'bash', arguments: { command: 'find production -name customers.json -delete' } } },
] as const satisfies readonly PolicyRoute[];

export type PolicyRouteIndex = 0 | 1 | 2 | 3;
