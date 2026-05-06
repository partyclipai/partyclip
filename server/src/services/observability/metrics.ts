/**
 * Phase 1 in-memory metrics. Pure aggregator; the runtime can attach
 * a sink (StatsD, Prometheus, OpenTelemetry) by replacing the default
 * sink in the registry. The plan calls out four baselines we want from
 * day one:
 *
 *   - per-stage cost            (gauge)
 *   - stage rejection rate      (counter / per-stage)
 *   - operator sign-off latency (histogram baseline for p95 > 7d alarm)
 *   - bias-mirror fill rates    (already exposed by services/bias-mirror)
 *
 * In-memory only is fine for Phase 1. We expose a small read API so
 * the operator UI can render counters without standing up a metrics
 * stack. Callers wanting a real backend swap the sink at boot.
 */

export type MetricSink = (event: MetricEvent) => void;

export type MetricEvent =
  | { kind: "counter"; name: string; value: number; tags: Readonly<Record<string, string>> }
  | { kind: "gauge"; name: string; value: number; tags: Readonly<Record<string, string>> }
  | { kind: "histogram"; name: string; value: number; tags: Readonly<Record<string, string>> };

export interface MetricSnapshot {
  counters: Map<string, number>;
  gauges: Map<string, number>;
  histograms: Map<string, { count: number; sum: number; min: number; max: number }>;
}

function tagKey(name: string, tags: Readonly<Record<string, string>>): string {
  const parts = Object.entries(tags)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`);
  return parts.length === 0 ? name : `${name}{${parts.join(",")}}`;
}

export interface MetricsRegistry {
  emit(event: MetricEvent): void;
  setSink(sink: MetricSink): void;
  /** Snapshot of current values; callers should treat as read-only. */
  snapshot(): MetricSnapshot;
}

export function createMetricsRegistry(): MetricsRegistry {
  const counters = new Map<string, number>();
  const gauges = new Map<string, number>();
  const histograms = new Map<string, { count: number; sum: number; min: number; max: number }>();

  let sink: MetricSink = () => {};

  return {
    emit(event) {
      const key = tagKey(event.name, event.tags);
      if (event.kind === "counter") {
        counters.set(key, (counters.get(key) ?? 0) + event.value);
      } else if (event.kind === "gauge") {
        gauges.set(key, event.value);
      } else {
        const existing = histograms.get(key);
        if (!existing) {
          histograms.set(key, { count: 1, sum: event.value, min: event.value, max: event.value });
        } else {
          existing.count += 1;
          existing.sum += event.value;
          if (event.value < existing.min) existing.min = event.value;
          if (event.value > existing.max) existing.max = event.value;
        }
      }
      try {
        sink(event);
      } catch {
        // observability must never crash a pipeline run
      }
    },
    setSink(s) {
      sink = s;
    },
    snapshot() {
      return {
        counters: new Map(counters),
        gauges: new Map(gauges),
        histograms: new Map(histograms),
      };
    },
  };
}

/**
 * Convenience: standardized partyclip metric names. Producers should
 * import these constants rather than typing the string literally so
 * renames stay grep-able.
 */
export const METRIC_NAMES = {
  STAGE_COST: "partyclip.stage.cost",
  STAGE_DURATION_MS: "partyclip.stage.duration_ms",
  STAGE_REJECTION: "partyclip.stage.rejection",
  STAGE_RUN: "partyclip.stage.run",
  OPERATOR_SIGNOFF_LATENCY_MS: "partyclip.operator.signoff_latency_ms",
  BIAS_MIRROR_FILL_RATIO: "partyclip.bias_mirror.fill_ratio",
  PATCH_PUBLISHED: "partyclip.patch.published",
  PATCH_KILLED: "partyclip.patch.killed",
} as const;

export type MetricName = (typeof METRIC_NAMES)[keyof typeof METRIC_NAMES];
