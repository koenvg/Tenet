type IconName = 'flag' | 'integrity' | 'coverage' | 'chevron' | 'refresh' | 'arrow';
const paths: Record<IconName, string> = {
  flag: 'M5 21V4m0 0c5-4 9 4 14 0v10c-5 4-9-4-14 0',
  integrity: 'M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6l-8-3Zm0 4v6m0 3v1',
  coverage: 'M12 3a9 9 0 1 0 9 9M12 7v5l3 2M16 3h5v5',
  chevron: 'm9 5 7 7-7 7',
  refresh: 'M20 7v5h-5M4 17v-5h5M6 6a8 8 0 0 1 13 1M5 17a8 8 0 0 0 13 1',
  arrow: 'M4 12h16m-6-6 6 6-6 6',
};
export function StatusIcon({ name, className = '' }: { name: IconName; className?: string }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
    strokeLinecap="round" strokeLinejoin="round" className={`h-4 w-4 shrink-0 ${className}`}><path d={paths[name]} /></svg>;
}
