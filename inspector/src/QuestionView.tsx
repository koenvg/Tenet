import SafeMarkdown from './SafeMarkdown.js';
import StatusChip from './StatusChip.js';
import { pretty } from './presentation.js';

const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

export default function QuestionView({ question, format = 'rich' }: { question: unknown; format?: 'rich' | 'json' }) {
  const data = object(question), choices = Object.entries(object(data.criteria));
  const other = Object.fromEntries(Object.entries(data).filter(([key]) => !['instructions', 'criteria'].includes(key)));
  if (format === 'json' || typeof data.instructions !== 'string') return <pre className="question-json">{pretty(question)}</pre>;
  return <div className="question-rich">
    <div className="rich-markdown"><SafeMarkdown source={data.instructions} /></div>
    {choices.length ? <><h6>Answer choices</h6><dl className="answer-choices">{choices.map(([label, description]) =>
      <div key={label}><dt><StatusChip value={label} /></dt><dd>{typeof description === 'string' ? <div className="rich-markdown"><SafeMarkdown source={description} /></div> : <pre>{pretty(description)}</pre>}</dd></div>)}</dl></>
      : <p className="muted">No answer choices recorded.</p>}
    {!!Object.keys(other).length && <details className="question-metadata"><summary>Other recorded fields</summary><pre>{pretty(other)}</pre></details>}
    {data.criteria !== undefined && (!choices.length || typeof data.criteria !== 'object') && <pre>{pretty(data.criteria)}</pre>}
  </div>;
}
