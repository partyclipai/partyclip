import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@/lib/router";
import {
  MissingOperatorTokenError,
  OperatorApiError,
  operatorApi,
  type PatchClassification,
  type PatchState,
  type PatchSummary,
} from "@/api/operator";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useOperatorToken } from "@/lib/operator-token";
import {
  PATCH_CLASSIFICATIONS,
  PATCH_STATES,
  formatCost,
  formatRelative,
  patchClassificationVariant,
  patchStateVariant,
} from "@/lib/patch-status";
import { ChevronDown, Filter, MoreHorizontal } from "lucide-react";

const PAGE_SIZE = 50;

interface MultiSelectProps<T extends string> {
  label: string;
  options: ReadonlyArray<T>;
  selected: T[];
  onChange: (next: T[]) => void;
}

function MultiSelect<T extends string>({ label, options, selected, onChange }: MultiSelectProps<T>) {
  const summary = selected.length === 0
    ? "All"
    : selected.length === 1
      ? selected[0]
      : `${selected.length} selected`;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <Filter />
          <span className="text-xs">{label}: {summary}</span>
          <ChevronDown />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-2">
        <div className="space-y-1">
          {options.map((opt) => {
            const checked = selected.includes(opt);
            return (
              <label key={opt} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-accent">
                <Checkbox
                  checked={checked}
                  onCheckedChange={(v) => {
                    if (v === true) onChange([...selected, opt]);
                    else onChange(selected.filter((s) => s !== opt));
                  }}
                />
                <span className="font-mono text-xs">{opt}</span>
              </label>
            );
          })}
        </div>
        {selected.length > 0 ? (
          <div className="mt-2 flex justify-end">
            <Button size="xs" variant="ghost" onClick={() => onChange([])}>Clear</Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

function PatchRow({ patch }: { patch: PatchSummary }) {
  return (
    <tr className="border-b border-border last:border-0 hover:bg-accent/30">
      <td className="px-3 py-2 align-top">
        <Link
          to={`/operator/patches/${patch.id}`}
          className="font-medium text-foreground hover:underline"
        >
          {patch.title || "(untitled)"}
        </Link>
      </td>
      <td className="px-3 py-2 align-top">
        <Badge variant={patchClassificationVariant(patch.classification)}>
          {patch.classification}
        </Badge>
      </td>
      <td className="px-3 py-2 align-top">
        <Badge variant={patchStateVariant(patch.state)}>{patch.state}</Badge>
      </td>
      <td className="px-3 py-2 align-top font-mono text-xs text-muted-foreground">
        {formatCost(patch.costTotal)}
      </td>
      <td className="px-3 py-2 align-top text-xs text-muted-foreground">
        {formatRelative(patch.updatedAt)}
      </td>
      <td className="px-3 py-2 align-top">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="actions">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link to={`/operator/patches/${patch.id}`}>View</Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </td>
    </tr>
  );
}

export function OperatorPatches() {
  const { token } = useOperatorToken();
  const [states, setStates] = useState<PatchState[]>([]);
  const [classifications, setClassifications] = useState<PatchClassification[]>([]);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);

  const queryParams = useMemo(
    () => ({
      state: states.length ? states : undefined,
      classification: classifications.length ? classifications : undefined,
      limit: pageSize,
    }),
    [states, classifications, pageSize],
  );

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["operator", "patches", queryParams],
    queryFn: () => operatorApi.listPatches(queryParams),
    enabled: !!token,
    retry: false,
  });

  if (!token) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-sm">
        <p className="font-medium">Operator token required.</p>
        <p className="mt-1 text-muted-foreground">
          Use the “Set token” button in the header to authenticate. The token is
          the value of <code className="font-mono text-xs">PARTYCLIP_OPERATOR_TOKEN</code> on the server.
        </p>
      </div>
    );
  }

  if (error) {
    if (error instanceof OperatorApiError && error.status === 401) {
      return (
        <div className="rounded-lg border border-destructive/40 bg-card p-6 text-sm">
          <p className="font-medium text-destructive">Token rejected (401).</p>
          <p className="mt-1 text-muted-foreground">Replace the token via the header.</p>
        </div>
      );
    }
    if (error instanceof OperatorApiError && error.status === 503) {
      return (
        <div className="rounded-lg border border-border bg-card p-6 text-sm">
          <p className="font-medium">Operator endpoints disabled (503).</p>
          <p className="mt-1 text-muted-foreground">
            Set <code className="font-mono text-xs">PARTYCLIP_OPERATOR_TOKEN</code> and
            <code className="font-mono text-xs"> PARTYCLIP_DEFAULT_COMPANY_ID</code> (or create
            a companies row) and restart the server.
          </p>
        </div>
      );
    }
    if (error instanceof MissingOperatorTokenError) return null;
    return (
      <div className="rounded-lg border border-destructive/40 bg-card p-6 text-sm text-destructive">
        Failed to load patches: {String((error as Error).message)}
      </div>
    );
  }

  const patches = data ?? [];

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold">Patches</h1>
          <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? "Refreshing…" : "Refresh"}
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <MultiSelect<PatchState>
            label="State"
            options={PATCH_STATES}
            selected={states}
            onChange={setStates}
          />
          <MultiSelect<PatchClassification>
            label="Class"
            options={PATCH_CLASSIFICATIONS}
            selected={classifications}
            onChange={setClassifications}
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button variant="outline" size="sm" disabled>
                  Ministry: —
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>wired in Phase 2</TooltipContent>
          </Tooltip>
        </div>

        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Title</th>
                <th className="px-3 py-2 font-medium">Class</th>
                <th className="px-3 py-2 font-medium">State</th>
                <th className="px-3 py-2 font-medium">Cost</th>
                <th className="px-3 py-2 font-medium">Updated</th>
                <th className="px-3 py-2 font-medium w-10" />
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">Loading…</td>
                </tr>
              ) : patches.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                    No patches match this filter.
                  </td>
                </tr>
              ) : (
                patches.map((p) => <PatchRow key={p.id} patch={p} />)
              )}
            </tbody>
          </table>
        </div>

        {patches.length >= pageSize ? (
          <div className="flex justify-center">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPageSize((n) => Math.min(n + PAGE_SIZE, 500))}
              disabled={pageSize >= 500}
            >
              {pageSize >= 500 ? "Max page size (500)" : "Load more"}
            </Button>
          </div>
        ) : null}
      </div>
    </TooltipProvider>
  );
}
