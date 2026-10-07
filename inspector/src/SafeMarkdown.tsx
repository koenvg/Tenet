import { createElement, Fragment } from 'react';
import { Lexer, type Token } from 'marked';

export default function SafeMarkdown({ source = '', tokens }: { source?: string; tokens?: Token[] }) {
  const content = tokens ?? Lexer.lex(source, { gfm: true, breaks: true });
  return <>{content.filter(token => token.type !== 'space').map((token, index) => {
    let node;
    switch (token.type) {
      case 'heading': node = createElement(`h${Math.min(6, Math.max(4, token.depth + 3))}`, null, <SafeMarkdown tokens={token.tokens} />); break;
      case 'paragraph': node = <p><SafeMarkdown tokens={token.tokens} /></p>; break;
      case 'escape': node = token.text; break;
      case 'text': node = token.tokens ? <SafeMarkdown tokens={token.tokens} /> : token.text; break;
      case 'strong': node = <strong><SafeMarkdown tokens={token.tokens} /></strong>; break;
      case 'em': node = <em><SafeMarkdown tokens={token.tokens} /></em>; break;
      case 'del': node = <del><SafeMarkdown tokens={token.tokens} /></del>; break;
      case 'codespan': node = <code>{token.text}</code>; break;
      case 'code': node = <pre><code>{token.text}</code></pre>; break;
      case 'br': node = <br />; break;
      case 'hr': node = <hr />; break;
      case 'blockquote': node = <blockquote><SafeMarkdown tokens={token.tokens} /></blockquote>; break;
      case 'list': {
        const items = token.items.map((item: { task?: boolean; checked?: boolean; tokens: Token[] }, i: number) =>
          <li key={i}>{item.task && (item.checked ? '[x] ' : '[ ] ')}<SafeMarkdown tokens={item.tokens} /></li>);
        node = token.ordered ? <ol start={typeof token.start === 'number' ? token.start : 1}>{items}</ol> : <ul>{items}</ul>;
        break;
      }
      case 'table': node = <table><thead><tr>{token.header.map((cell: { tokens: Token[] }, i: number) => <th key={i} scope="col"><SafeMarkdown tokens={cell.tokens} /></th>)}</tr></thead>
        <tbody>{token.rows.map((row: { tokens: Token[] }[], i: number) => <tr key={i}>{row.map((cell, j) => <td key={j}><SafeMarkdown tokens={cell.tokens} /></td>)}</tr>)}</tbody></table>; break;
      case 'link': node = <span className="inert-link"><SafeMarkdown tokens={token.tokens} /> <code>({token.href})</code></span>; break;
      case 'html': node = token.block ? <pre className="markdown-literal"><code>{token.raw}</code></pre> : <code>{token.raw}</code>; break;
      default: node = token.raw;
    }
    return <Fragment key={index}>{node}</Fragment>;
  })}</>;
}
