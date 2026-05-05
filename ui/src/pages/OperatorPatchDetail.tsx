import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "@/lib/router";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  OperatorApiError,
  operatorApi,
  type BiasFinding,
  type BiasReport,
  type PatchDetail,
  type StageRunRow,
  type OperatorActionPath,
} from "@/api/operator";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useOperatorToken } from "@/lib/operator-token";
import {
  actionLabel,
  actionTone,
  availableActions,
  formatCost,
  formatRelative,
  patchClassificationVariant,
  patchStateVariant,
} from "@/lib/patch-status";
import { PatchActionDialog } from "@/components/operator/PatchActionDialog";
import { ChevronDown, ChevronRight, ArrowLeft } from "lucide-react";

function StageGroup({ stage, runs }: { stage: string; runs: StageRunRow[] }) {
  const [open, setOpen] = useState(runs.length <= 1);
  const latest = runs[0];
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-md border border-border">
      <CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-accent/40">
        {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        <span className="font-mono text-xs uppercase text-muted-foreground">{stage}</span>
        <span className="text-sm">{latest.agentRole}</span>
        {latest.decision ? (
          <Badge variant="secondary">{latest.decision}</Badge>
        ) : null}
        {runs.length > 1 ? (
          <span className="ml-auto text-xs text-muted-foreground">
            {runs.length} attempts
          </span>
        ) : (
          <span className="ml-auto text-xs text-muted-foreground">
            {formatRelative(latest.finishedAt ?? latest.startedAt)}
          </span>
        )}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="divide-y divide-border">
          {runs.map((run) => (
            <li key={run.id} className="grid grid-cols-2 gap-2 px-3 py-2 text-xs md:grid-cols-4">
              <Field label="attempt" value={`#${run.attempt}`} />
              <Field label="decision" value={run.decision ?? "—"} />
              <Field label="reason" value={run.reasonCode ?? "—"} />
              <Field label="cost" value={formatCost(run.cost)} />
              <Field label="duration" value={run.durationMs != null ? `${run.durationMs}ms` : "—"} />
              <Field label="model" value={run.model ?? "—"} />
              <Field label="agent" value={run.agentId ?? "—"} mono />
              <Field label="finished" value={formatRelative(run.finishedAt)} />
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={mono ? "font-mono text-xs" : ""}>{value}</div>
    </div>
  );
}

function Timeline({ stageRuns }: { stageRuns: ReadonlyArray<StageRunRow> }) {
  const grouped = useMemo(() => {
    const map = new Map<string, StageRunRow[]>();
    for (const run of stageRuns) {
      const arr = map.get(run.stage) ?? [];
      arr.push(run);
      map.set(run.stage, arr);
    }
    return Array.from(map.entries());
  }, [stageRuns]);

  if (grouped.length === 0) {
    return <p className="text-sm text-muted-foreground">No stage runs yet.</p>;
  }

  return (
    <div className="space-y-2">
      {grouped.map(([stage, runs]) => (
        <StageGroup key={stage} stage={stage} runs={runs} />
      ))}
    </div>
  );
}

function Citations({ citations }: { citations: PatchDetail["citations"] }) {
  if (citations.length === 0) {
    return <p className="text-xs text-muted-foreground">No citations.</p>;
  }
  return (
    <ul className="space-y-1">
      {citations.map((c, i) => (
        <li key={`${c.stable_id}-${i}`} className="text-xs">
          <span className="font-mono">[{c.stable_id}]</span>{" "}
          <span className="text-muted-foreground">{c.relevance}</span>
        </li>
      ))}
    </ul>
  );
}

function BiasFindingItem({ finding }: { finding: BiasFinding }) {
  const severityVariant = finding.severity === "high" || finding.severity === "critical"
    ? "destructive"
    : finding.severity === "medium"
      ? "outline"
      : "secondary";
  return (
    <li className="rounded-md border border-border p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs uppercase text-muted-foreground">{finding.category}</span>
        <Badge variant={severityVariant}>{finding.severity}</Badge>
      </div>
      <div className="mt-2">
        {finding.quote.trim() ? (
          <blockquote className="border-l-2 border-border pl-3 text-sm">
            “{finding.quote}”
          </blockquote>
        ) : (
          <p className="text-xs italic text-muted-foreground">(no quote provided)</p>
        )}
      </div>
      {finding.explanation ? (
        <p className="mt-2 text-sm">{finding.explanation}</p>
      ) : null}
      <div className="mt-2">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Suggestion</div>
        {finding.suggestion.trim() ? (
          <p className="text-sm">{finding.suggestion}</p>
        ) : (
          <p className="text-xs italic text-muted-foreground">(no suggestion provided)</p>
        )}
      </div>
    </li>
  );
}

function BiasReports({ patchId }: { patchId: string }) {
  const { token } = useOperatorToken();
  const { data, isLoading, error } = useQuery({
    queryKey: ["operator", "patch", patchId, "bias-reports"],
    queryFn: () => operatorApi.getBiasReports(patchId),
    enabled: !!token,
    retry: false,
  });

  if (!token) return null;
  if (isLoading) return <p className="text-sm text-muted-foreground">Loading bias reports…</p>;
  if (error) {
    return (
      <p className="text-sm text-destructive">
        Failed to load bias reports: {(error as Error).message}
      </p>
    );
  }
  const reports = data ?? [];
  if (reports.length === 0) {
    return <p className="text-sm text-muted-foreground">No bias reports for this patch.</p>;
  }
  return (
    <div className="space-y-4">
      {reports.map((report: BiasReport) => (
        <div key={report.id} className="space-y-2">
          <div className="flex items-center gap-2">
            <Badge variant="outline">{report.overallDecision}</Badge>
            <span className="text-xs text-muted-foreground">
              {formatRelative(report.createdAt)} · {report.findings.length} finding{report.findings.length === 1 ? "" : "s"}
            </span>
          </div>
          {report.findings.length === 0 ? (
            <p className="text-xs italic text-muted-foreground">No findings recorded.</p>
          ) : (
            <ul className="space-y-2">
              {report.findings.map((f) => (
                <BiasFindingItem key={f.id} finding={f} />
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

function ActionsPanel({
  state,
  onPick,
}: {
  state: PatchDetail["state"];
  onPick: (a: OperatorActionPath) => void;
}) {
  const actions = availableActions(state);
  if (actions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No operator actions available from <code className="font-mono text-xs">{state}</code>.
      </p>
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((a) => (
        <Button
          key={a}
          size="sm"
          variant={actionTone(a) === "destructive" ? "destructive" : "default"}
          onClick={() => onPick(a)}
        >
          {actionLabel(a)}
        </Button>
      ))}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}

export function OperatorPatchDetail() {
  const { patchId } = useParams<{ patchId: string }>();
  const { token } = useOperatorToken();
  const [pendingAction, setPendingAction] = useState<OperatorActionPath | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["operator", "patch", patchId],
    queryFn: () => operatorApi.getPatch(patchId!),
    enabled: !!token && !!patchId,
    retry: false,
  });

  if (!token) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-sm">
        <p className="font-medium">Operator token required.</p>
      </div>
    );
  }
  if (isLoading) return <p className="text-sm text-muted-foreground">Loading patch…</p>;
  if (error) {
    if (error instanceof OperatorApiError && error.status === 404) {
      return <p className="text-sm">Patch not found.</p>;
    }
    return (
      <p className="text-sm text-destructive">Error: {(error as Error).message}</p>
    );
  }
  if (!data) return null;

  return (
    <div className="space-y-8">
      <div>
        <Link
          to="/operator/patches"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3" /> All patches
        </Link>
      </div>

      {/* 1. Header */}
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">{data.title || "(untitled)"}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={patchClassificationVariant(data.classification)}>
            {data.classification}
          </Badge>
          <Badge variant={patchStateVariant(data.state)}>{data.state}</Badge>
          <span className="text-xs text-muted-foreground">
            cost {formatCost(data.costTotal)}
          </span>
          <span className="text-xs text-muted-foreground">
            updated {formatRelative(data.updatedAt)}
          </span>
        </div>
        {data.pausedAt ? (
          <div className="rounded-md border border-destructive/50 bg-destructive/5 px-3 py-2 text-sm">
            <strong className="text-destructive">PAUSED</strong>{" "}
            <span className="text-muted-foreground">
              at {new Date(data.pausedAt).toISOString()}
            </span>
          </div>
        ) : null}
      </header>

      {/* 2. Pipeline timeline */}
      <Section title="Pipeline timeline">
        <Timeline stageRuns={data.stageRuns} />
      </Section>

      {/* 3. Body + citations sidebar */}
      <Section title="Body">
        <div className="grid gap-6 md:grid-cols-[1fr_240px]">
          <article className="prose prose-sm max-w-none dark:prose-invert">
            <Markdown remarkPlugins={[remarkGfm]}>{data.body}</Markdown>
          </article>
          <aside className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Citations</h3>
            <Citations citations={data.citations} />
          </aside>
        </div>
      </Section>

      {/* 4. Bias report */}
      <Section title="Bias report">
        <BiasReports patchId={patchId!} />
      </Section>

      {/* 5. Operator actions */}
      <Section title="Operator actions">
        <ActionsPanel state={data.state} onPick={setPendingAction} />
      </Section>

      <PatchActionDialog
        patchId={patchId!}
        action={pendingAction}
        onClose={() => setPendingAction(null)}
      />
    </div>
  );
}
