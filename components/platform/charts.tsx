"use client";

/** Spark and funnel rows, reused from Marlo-platform's overview (same .ov-* classes). */

export function Spark({ values, days }: { values: number[]; days: string[] }) {
  const max = Math.max(1, ...values);
  return (
    <div className="ov-spark">
      {values.map((v, i) => (
        <i
          key={i}
          className={`${v === 0 ? "zero " : ""}${i === values.length - 1 ? "last" : ""}`}
          style={{ height: `${Math.max(4, (v / max) * 100)}%` }}
          title={`${days[i] ?? `Day ${i + 1}`}: ${v}`}
        />
      ))}
    </div>
  );
}

export function Trends({ series, days }: { series: { title: string; values: number[] }[]; days: string[] }) {
  return (
    <div className={`ov-trends${series.length === 3 ? " three" : ""}`}>
      {series.map((s) => (
        <div className="ov-trend" key={s.title}>
          <div className="ov-trend-head">
            <span>{s.title}</span>
            <b>{s.values.reduce((a, b) => a + b, 0).toLocaleString()}</b>
          </div>
          <Spark values={s.values} days={days} />
        </div>
      ))}
    </div>
  );
}

export function FunnelRow({ label, count, of, tone }: { label: string; count: number; of: number; tone?: "warn" | "bad" }) {
  const rate = of ? Math.round((count / of) * 100) : 0;
  return (
    <div className="ov-funnel-row">
      <span>{label}</span>
      <div className={`pf-bar ${tone ?? ""}`}>
        <i style={{ width: `${rate}%` }} />
      </div>
      <span className="ov-funnel-num">
        {count.toLocaleString()} · {rate}%
      </span>
    </div>
  );
}
