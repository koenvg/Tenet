export function supportsTenetProvider(providerId: string): boolean {
  return providerId === 'pi' || providerId === 'pi-subagents';
}
