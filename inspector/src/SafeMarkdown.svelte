<script lang="ts">
  import { Lexer, type Token } from 'marked';
  export let source = '';
  export let tokens: Token[] | undefined = undefined;
  $: content = tokens ?? Lexer.lex(source, { gfm: true, breaks: true });
</script>

{#each content.filter(token => token.type !== 'space') as token}
  {#if token.type === 'heading'}
    <svelte:element this={`h${Math.min(6, Math.max(4, token.depth + 3))}`}><svelte:self tokens={token.tokens} /></svelte:element>
  {:else if token.type === 'paragraph'}
    <p><svelte:self tokens={token.tokens} /></p>
  {:else if token.type === 'escape'}{token.text}
  {:else if token.type === 'text'}
    {#if token.tokens}<svelte:self tokens={token.tokens} />{:else}{token.text}{/if}
  {:else if token.type === 'strong'}<strong><svelte:self tokens={token.tokens} /></strong>
  {:else if token.type === 'em'}<em><svelte:self tokens={token.tokens} /></em>
  {:else if token.type === 'del'}<del><svelte:self tokens={token.tokens} /></del>
  {:else if token.type === 'codespan'}<code>{token.text}</code>
  {:else if token.type === 'code'}<pre><code>{token.text}</code></pre>
  {:else if token.type === 'br'}<br />
  {:else if token.type === 'hr'}<hr />
  {:else if token.type === 'blockquote'}<blockquote><svelte:self tokens={token.tokens} /></blockquote>
  {:else if token.type === 'list'}
    {#if token.ordered}<ol start={typeof token.start === 'number' ? token.start : 1}>{#each token.items as item}<li>{#if item.task}{item.checked ? '[x] ' : '[ ] '}{/if}<svelte:self tokens={item.tokens} /></li>{/each}</ol>
    {:else}<ul>{#each token.items as item}<li>{#if item.task}{item.checked ? '[x] ' : '[ ] '}{/if}<svelte:self tokens={item.tokens} /></li>{/each}</ul>{/if}
  {:else if token.type === 'table'}
    <table><thead><tr>{#each token.header as cell}<th scope="col"><svelte:self tokens={cell.tokens} /></th>{/each}</tr></thead><tbody>{#each token.rows as row}<tr>{#each row as cell}<td><svelte:self tokens={cell.tokens} /></td>{/each}</tr>{/each}</tbody></table>
  {:else if token.type === 'link'}
    <span class="inert-link"><svelte:self tokens={token.tokens} /> <code>({token.href})</code></span>
  {:else}
    {token.raw}
  {/if}
{/each}
