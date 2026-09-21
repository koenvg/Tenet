<script lang="ts">
  import { tone } from './presentation';
  export let value: string;
  export let label: string | undefined = undefined;
</script>

<span class="status-chip {tone(value)}">{label ?? value}</span>

<style>
  .status-chip { display: inline-flex; align-items: center; gap: .35rem; width: fit-content; max-width: 100%; padding: .15rem .5rem; border: 1px solid #cdd6e1; border-radius: 999px; background: #eef2f6; color: #46576b; font-size: .75rem; font-weight: 650; line-height: 1.4; vertical-align: middle; overflow-wrap: anywhere; }
  .status-chip::before { content: ''; width: 5px; height: 5px; border-radius: 50%; background: currentColor; flex: none; }
  .positive { color: #17623e; background: #e7f5ed; border-color: #b4dcc5; }
  .danger { color: #9b3534; background: #fbeceb; border-color: #eac1bd; }
  .caution { color: #805516; background: #fcf2de; border-color: #e6d1a7; }
  .approval { color: #62419a; background: #f0eafb; border-color: #d5c5ed; }
</style>
