import { useEffect, useState, useSyncExternalStore } from 'react';
import { createArchiveNavigation } from './archive-navigation.js';

export function useArchive(active = true) {
  const [archive] = useState(createArchiveNavigation);
  const state = useSyncExternalStore(archive.subscribe, archive.getSnapshot);
  useEffect(() => { if (active) return archive.start(); }, [archive, active]);
  return { ...state, ...archive };
}
export type Archive = ReturnType<typeof useArchive>;
