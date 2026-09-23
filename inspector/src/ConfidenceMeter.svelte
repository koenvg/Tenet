<script lang="ts">
  export let label: string;
  export let value: number;
  export let threshold: number;
</script>

<div class="confidence-reading">
  <div class="confidence-label"><strong>{label}</strong><span>Below required confidence</span></div>
  <div class="confidence-track" role="meter" aria-label={label} aria-valuemin="0" aria-valuemax="1" aria-valuenow={value} aria-valuetext={`${value}; required confidence ${threshold}`}>
    <span class="confidence-fill" style:width={`${value * 100}%`}></span>
    <span class="confidence-threshold" style:left={`${threshold * 100}%`}></span>
  </div>
  <div class="confidence-values"><span>Recorded <strong>{String(value)}</strong></span><span>Required <strong>{String(threshold)}</strong></span></div>
</div>
