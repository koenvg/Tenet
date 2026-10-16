import { useEffect, useState, useSyncExternalStore } from 'react';
import { createArchiveNavigation } from './archive-navigation.js';

export function useArchive() {
  const [archive] = useState(createArchiveNavigation);
  const state = useSyncExternalStore(archive.subscribe, archive.getSnapshot);
  useEffect(() => archive.start(), [archive]);
  return { ...state, ...archive };
}
export type Archive = ReturnType<typeof useArchive>;
