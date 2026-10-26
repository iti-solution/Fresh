import { cn } from "@/lib/utils";

export type BarDatum = { key: string; label: string; value: number; tooltip: string; highlight?: boolean; muted?: boolean };

/**
 * Wykres słupkowy jednej serii (SVG, renderowany na serwerze). Podpowiedź po najechaniu na słupek
 * (cała kolumna jest polem trafienia). Wyróżnione słupki = bieżący okres, wyciszone = dni bez danych.
 */
export function BarChart({
  data,
  height = 168,
  format,
  ariaLabel,
  reference,
}: {
  data: BarDatum[];
  height?: number;
  format: (v: number) => string;
  ariaLabel: string;
  reference?: { value: number; label: string };
}) {
  const W = 720;
  const H = height;
  const top = 14;
  const bottom = 22;
  const max = Math.max(1, ...data.map((d) => d.value), reference?.value ?? 0);
  const slot = W / Math.max(data.length, 1);
  const bw = Math.max(4, Math.min(28, slot - 6));
  const y = (v: number) => top + (H - top - bottom) * (1 - v / max);
  const labelEvery = Math.ceil(data.length / 10);
  return (
    <figure className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full overflow-visible" role="img" aria-label={ariaLabel}>
        {[0.5, 1].map((f) => (
          <g key={f}>
            <line x1={0} x2={W} y1={y(max * f)} y2={y(max * f)} stroke="var(--border)" strokeDasharray="2 4" />
            <text x={0} y={y(max * f) - 4} fontSize={10} fill="var(--subtle)">
              {format(max * f)}
            </text>
          </g>
        ))}
        <line x1={0} x2={W} y1={y(0)} y2={y(0)} stroke="var(--border-strong)" />
        {data.map((d, i) => {
          const x = i * slot + (slot - bw) / 2;
          const h = Math.max(d.value > 0 ? 2 : 0, y(0) - y(d.value));
          return (
            <g key={d.key} className="group">
              <title>{d.tooltip}</title>
              <rect x={i * slot} y={top} width={slot} height={H - top - bottom} fill="transparent" />
              <rect
                x={i * slot}
                y={top}
                width={slot}
                height={H - top - bottom}
                className="fill-transparent group-hover:fill-foreground/[0.04]"
              />
              <path
                d={barPath(x, y(0), bw, h)}
                className={cn(d.muted ? "fill-border-strong" : d.highlight ? "fill-primary" : "fill-primary/35")}
              />
              {i % labelEvery === 0 && (
                <text x={i * slot + slot / 2} y={H - 6} fontSize={10} textAnchor="middle" fill="var(--subtle)">
                  {d.label}
                </text>
              )}
            </g>
          );
        })}
        {reference && (
          <g>
            <line
              x1={0}
              x2={W}
              y1={y(reference.value)}
              y2={y(reference.value)}
              stroke="var(--foreground)"
              strokeOpacity={0.45}
              strokeDasharray="5 4"
            />
            <text x={W} y={y(reference.value) - 4} fontSize={10} textAnchor="end" fill="var(--muted)">
              {reference.label}
            </text>
          </g>
        )}
      </svg>
    </figure>
  );
}

/** Słupek z zaokrąglonym tylko górnym końcem (dół zakotwiczony w osi). */
function barPath(x: number, base: number, w: number, h: number): string {
  if (h <= 0) return "";
  const r = Math.min(4, h, w / 2);
  const top = base - h;
  return `M${x},${base} V${top + r} Q${x},${top} ${x + r},${top} H${x + w - r} Q${x + w},${top} ${x + w},${top + r} V${base} Z`;
}

/** Mini linia trendu (np. terminowość dzień po dniu) z osią min–max. */
export function LineChart({
  points,
  height = 220,
  width = 440,
  min = 0,
  max = 100,
  format,
  ariaLabel,
  target,
}: {
  points: { key: string; label: string; value: number | null; tooltip: string }[];
  height?: number;
  width?: number;
  min?: number;
  max?: number;
  format: (v: number) => string;
  ariaLabel: string;
  target?: { value: number; label: string };
}) {
  const W = width;
  const H = height;
  const top = 12;
  const bottom = 22;
  const slot = W / Math.max(points.length, 1);
  const x = (i: number) => i * slot + slot / 2;
  const y = (v: number) => top + (H - top - bottom) * (1 - (v - min) / (max - min || 1));
  const valid = points.map((p, i) => ({ ...p, i })).filter((p): p is typeof p & { value: number } => p.value !== null);
  const d = valid.map((p, k) => `${k === 0 ? "M" : "L"}${x(p.i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const labelEvery = Math.ceil(points.length / 6);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full overflow-visible" role="img" aria-label={ariaLabel}>
      {[min, (min + max) / 2, max].map((v) => (
        <g key={v}>
          <line x1={0} x2={W} y1={y(v)} y2={y(v)} stroke="var(--border)" strokeDasharray={v === min ? undefined : "2 4"} />
          <text x={0} y={y(v) - 4} fontSize={10} fill="var(--subtle)">
            {format(v)}
          </text>
        </g>
      ))}
      {target && (
        <g>
          <line x1={0} x2={W} y1={y(target.value)} y2={y(target.value)} stroke="var(--warning)" strokeDasharray="5 4" />
          <text x={W} y={y(target.value) - 4} fontSize={10} textAnchor="end" fill="var(--warning)">
            {target.label}
          </text>
        </g>
      )}
      <path d={d} fill="none" stroke="var(--primary)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {valid.map((p) => (
        <g key={p.key} className="group">
          <title>{p.tooltip}</title>
          <rect x={p.i * slot} y={0} width={slot} height={H - bottom} fill="transparent" />
          <circle
            cx={x(p.i)}
            cy={y(p.value)}
            r={4}
            fill="var(--surface)"
            stroke="var(--primary)"
            strokeWidth={2}
            className="opacity-0 group-hover:opacity-100"
          />
        </g>
      ))}
      {points.map((p, i) =>
        i % labelEvery === 0 ? (
          <text key={p.key} x={x(i)} y={H - 6} fontSize={10} textAnchor="middle" fill="var(--subtle)">
            {p.label}
          </text>
        ) : null,
      )}
    </svg>
  );
}
