import { useRef, useState } from 'react';
import type { Archive } from './archive-state.js';
import { inventoryNote, projectName, recordedTime, RuleIcon, RuleStatusLabel } from './SessionRules.js';

export default function SessionPicker({ archive }: { archive: Archive }) {
  const trigger = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const current = archive.sessions.find(s => s.id === archive.session);
  const summary = archive.rules ?? current;
  const choose = (id: string) => { menu.current?.hidePopover(); trigger.current?.focus(); if (id !== archive.session) void archive.selectSession(id); };
  return <div className="rule-session-switch">
    <span id="session-label">Session</span>
    <button ref={trigger} className="rule-session-toggle" type="button" popoverTarget="rule-session-menu" aria-expanded={open} aria-labelledby="session-label session-current">
      <span className="rule-session-value" id="session-current"><strong>{current ? `${projectName(current.projects)} · ${recordedTime(current.started)}` : archive.session ? 'Selected session' : 'Choose a session'}</strong>
        {summary && <><RuleStatusLabel status={summary.status} /><small>{inventoryNote(summary.inventory)}</small></>}</span><RuleIcon kind="chevron" />
    </button>
    <div ref={menu} className="rule-session-menu" id="rule-session-menu" popover="auto" onToggle={event => setOpen(event.newState === 'open')}>
      <p>Choose a session</p>
      <div role="group" aria-label="Recorded sessions">{archive.sessions.map(item => <label className="rule-session-option" key={item.id}>
        <input type="radio" name="recorded-session" checked={archive.session === item.id} value={item.id} onChange={() => choose(item.id)} onClick={() => { if (item.id === archive.session) choose(item.id); }} />
        <span><span className="rule-session-option-top"><strong>{projectName(item.projects)} · {recordedTime(item.started)}</strong><RuleStatusLabel status={item.status} /></span><small>{inventoryNote(item.inventory)}</small></span>
      </label>)}</div>
      {archive.nextSession && <button disabled={archive.busy} onClick={() => archive.loadSessions(archive.nextSession!)}>More sessions</button>}
      {!archive.sessions.length && <p>{archive.busy ? 'Reading archive…' : 'No recorded sessions.'}</p>}
      <p className="rule-session-note">Statuses describe recorded checks, not guaranteed compliance.</p>
    </div>
  </div>;
}
