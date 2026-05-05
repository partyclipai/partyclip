import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  OperatorApiError,
  RATIONALE_MAX,
  RATIONALE_MIN,
  operatorApi,
  type OperatorActionPath,
} from "@/api/operator";
import { actionLabel, actionTone } from "@/lib/patch-status";

interface Props {
  patchId: string;
  action: OperatorActionPath | null;
  onClose: () => void;
}

export function PatchActionDialog({ patchId, action, onClose }: Props) {
  const queryClient = useQueryClient();
  const [rationale, setRationale] = useState("");
  const [conflictMessage, setConflictMessage] = useState<string | null>(null);

  useEffect(() => {
    if (action) {
      setRationale("");
      setConflictMessage(null);
    }
  }, [action]);

  const mutation = useMutation({
    mutationFn: async (input: { action: OperatorActionPath; rationale: string }) =>
      operatorApi.runAction(patchId, input.action, input.rationale),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operator", "patches"] });
      queryClient.invalidateQueries({ queryKey: ["operator", "patch", patchId] });
      queryClient.invalidateQueries({ queryKey: ["operator", "patch", patchId, "bias-reports"] });
      onClose();
    },
  });

  if (!action) return null;

  const trimmed = rationale.trim();
  const tooShort = trimmed.length < RATIONALE_MIN;
  const tooLong = trimmed.length > RATIONALE_MAX;
  const invalid = tooShort || tooLong;

  const submit = () => {
    if (invalid) return;
    setConflictMessage(null);
    mutation.mutate(
      { action, rationale: trimmed },
      {
        onError: (err) => {
          if (err instanceof OperatorApiError) {
            if (err.status === 409) {
              setConflictMessage(
                "The patch state changed under you. Refresh the detail and try again.",
              );
              return;
            }
            if (err.status === 400) {
              setConflictMessage(
                `Server rejected rationale: ${err.errorCode}`,
              );
              return;
            }
          }
          setConflictMessage((err as Error).message);
        },
      },
    );
  };

  const tone = actionTone(action);

  return (
    <Dialog open={action != null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{actionLabel(action)} patch</DialogTitle>
          <DialogDescription>
            Rationale is recorded in the activity log and is publicly visible.
            Minimum {RATIONALE_MIN} characters.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Textarea
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
            placeholder="Explain why this action is being taken…"
            rows={6}
            autoFocus
            aria-invalid={tooLong || (rationale.length > 0 && tooShort)}
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>
              {tooLong
                ? `Too long (${trimmed.length}/${RATIONALE_MAX})`
                : tooShort && rationale.length > 0
                  ? `Need ${RATIONALE_MIN - trimmed.length} more characters`
                  : `${trimmed.length}/${RATIONALE_MAX}`}
            </span>
          </div>
          {conflictMessage ? (
            <p className="text-xs text-destructive">{conflictMessage}</p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            variant={tone === "destructive" ? "destructive" : "default"}
            onClick={submit}
            disabled={invalid || mutation.isPending}
          >
            {mutation.isPending ? "Submitting…" : `Confirm ${actionLabel(action).toLowerCase()}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
