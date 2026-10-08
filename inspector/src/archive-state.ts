import { useEffect, useLayoutEffect, useState, useSyncExternalStore } from 'react';
import { createArchiveNavigation } from './archive-navigation.js';
import type { MobileView } from './presentation.js';

export function useArchive() {
  const [archive] = useState(createArchiveNavigation);
  const state = useSyncExternalStore(archive.subscribe, archive.getSnapshot);
  const [mobileView, setMobileView] = useState<MobileView>('calls');
  const [pickerOpen, setPickerOpen] = useState(true);
  const [projectInput, setProjectInput] = useState('');
  useLayoutEffect(() => { setPickerOpen(!state.session); setMobileView('calls'); }, [state.session]);
  useLayoutEffect(() => { if (state.invocation) setMobileView('assessment'); }, [state.invocation]);
  useEffect(() => archive.start(), [archive]);
  return { ...state, ...archive, mobileView, pickerOpen, projectInput, setMobileView, setPickerOpen, setProjectInput,
    selectSession: async (id: string) => { setPickerOpen(!id); setMobileView('calls'); await archive.selectSession(id); },
    selectInvocation: async (id: string) => { setMobileView('assessment'); await archive.selectInvocation(id); },
    filterProjects: (project = projectInput) => { setProjectInput(project); archive.filterProjects(project); },
    showSummary: () => setMobileView('assessment'),
  };
}
