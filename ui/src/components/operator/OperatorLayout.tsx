import { useState, type ReactNode } from "react";
import { Link, Outlet } from "@/lib/router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useOperatorToken } from "@/lib/operator-token";
import { KeyRound, ShieldCheck } from "lucide-react";

function TokenPanel() {
  const { token, scope, setToken, clearToken } = useOperatorToken();
  const [draft, setDraft] = useState("");
  const [persist, setPersist] = useState(scope === "local");
  const [open, setOpen] = useState(!token);

  const masked = token ? `${"•".repeat(Math.max(token.length - 4, 0))}${token.slice(-4)}` : "";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          {token ? (
            <>
              <ShieldCheck className="text-foreground" />
              <span className="font-mono text-xs">{masked}</span>
            </>
          ) : (
            <>
              <KeyRound />
              Set token
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-3">
        <div>
          <Label htmlFor="operator-token-input" className="text-xs">
            Operator bearer token
          </Label>
          <Input
            id="operator-token-input"
            type="password"
            autoComplete="off"
            placeholder="paste PARTYCLIP_OPERATOR_TOKEN"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="mt-1"
          />
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Checkbox
            checked={persist}
            onCheckedChange={(v) => setPersist(v === true)}
          />
          Remember on this device (otherwise cleared on tab close)
        </label>
        <div className="flex justify-end gap-2">
          {token ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                clearToken();
                setDraft("");
              }}
            >
              Clear
            </Button>
          ) : null}
          <Button
            size="sm"
            disabled={!draft.trim()}
            onClick={() => {
              setToken(draft.trim(), persist ? "local" : "session");
              setDraft("");
              setOpen(false);
            }}
          >
            Save
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function OperatorShell({ children }: { children?: ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <Link to="/operator/patches" className="flex items-center gap-2 text-sm font-semibold">
            partyclip
            <span className="rounded-md border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              Operator
            </span>
          </Link>
          <TokenPanel />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-6">
        {children ?? <Outlet />}
      </main>
    </div>
  );
}
