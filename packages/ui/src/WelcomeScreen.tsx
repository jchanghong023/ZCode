import { useState } from "react";
import { Alert, AlertDescription } from "./components/ui/alert.js";
import { Button } from "./components/ui/button.js";
import { useZCodeIntl } from "./i18n/IntlProvider.js";
import { LoginApiKeyForm } from "./login/LoginApiKeyForm.js";
import type { useCredentialStoreRecovery } from "@/hooks/useCredentials.js";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog.js";

export function CredentialStoreRecovery({
  recovery,
}: {
  recovery: ReturnType<typeof useCredentialStoreRecovery>;
}) {
  const { intl } = useZCodeIntl();
  const [confirming, setConfirming] = useState(false);
  const text = (id: Parameters<typeof intl.formatMessage>[0]["id"]) => intl.formatMessage({ id });
  return (
    <main
      data-testid="credential-store-recovery"
      className="relative flex min-h-dvh items-center justify-center bg-background p-4 text-foreground"
    >
      <section className="w-full max-w-md space-y-4 rounded-2xl border border-popover-border bg-background p-6 text-ui-base shadow-md">
        <h1 className="text-ui-lg font-semibold">{text("login.credentialStore.title")}</h1>
        <p className="text-foreground-subtle">
          {text(
            recovery.state?.status === "recovered"
              ? "login.credentialStore.done"
              : recovery.state?.status === "changed"
                ? "login.credentialStore.changed"
                : "login.credentialStore.description",
          )}
        </p>
        {recovery.state?.status === "recovered" && (
          <p className="break-all text-ui-sm text-foreground-subtle">{recovery.state.backupPath}</p>
        )}
        {recovery.failed && (
          <Alert variant="destructive" data-testid="credential-store-recovery-error">
            <AlertDescription>{text("login.credentialStore.failed")}</AlertDescription>
          </Alert>
        )}
        {recovery.state?.status === "corrupt" ? (
          <Button
            data-testid="credential-store-recovery-open"
            disabled={recovery.busy}
            onClick={() => setConfirming(true)}
          >
            {text("login.credentialStore.restore")}
          </Button>
        ) : (
          <Button
            data-testid="credential-store-recovery-reload"
            onClick={() => window.location.reload()}
          >
            {text("login.credentialStore.reload")}
          </Button>
        )}
      </section>
      <AlertDialog
        open={confirming}
        onOpenChange={(open) => {
          if (!recovery.busy) setConfirming(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{text("login.credentialStore.restore")}</AlertDialogTitle>
            <AlertDialogDescription>{text("login.credentialStore.confirm")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              data-testid="credential-store-recovery-cancel"
              disabled={recovery.busy}
            >
              {text("common.cancel")}
            </AlertDialogCancel>
            <Button
              variant="destructive"
              data-testid="credential-store-recovery-confirm"
              disabled={recovery.busy}
              onClick={async () => {
                await recovery.recover();
                setConfirming(false);
              }}
            >
              {text("login.credentialStore.restore")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

export type LoginCompleteReason = "apiKey" | "skip";
interface LoginPanelProps {
  active: boolean;
  onComplete: (reason: LoginCompleteReason) => void | Promise<void>;
}

/** 仅配置模型调用凭据；产品操作者入口由浏览器 owner 管理。 */
export function LoginPanel({ active, onComplete }: LoginPanelProps) {
  if (!active) return null;
  return (
    <div className="space-y-4 text-ui-base">
      <h1 className="text-ui-xl font-semibold">模型配置</h1>
      <LoginApiKeyForm
        onCancel={() => {
          void onComplete("skip");
        }}
        onSaved={() => onComplete("apiKey")}
        onSkipped={() => onComplete("skip")}
      />
    </div>
  );
}

export function WelcomeScreen({ onComplete }: Omit<LoginPanelProps, "active">) {
  return (
    <main className="flex min-h-full items-center justify-center bg-background p-6 text-foreground">
      <section className="w-full max-w-sm rounded-2xl bg-background p-8 shadow-md">
        <LoginPanel active onComplete={onComplete} />
      </section>
    </main>
  );
}
