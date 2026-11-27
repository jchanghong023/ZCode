import { AIREQ_THEMES, DEFAULT_AIREQ_THEME } from "@/useTheme.js";
import { formatUserFacingError } from "@/lib/errorMessage.js";
import { useEffect, useState } from "react";
import { LucideProvider } from "lucide-react";
import type { AIReqDataSource } from "../contract.js";
import { ServiceProvider } from "@/hooks/useServices.js";
import { PlatformProvider } from "@/hooks/usePlatform.js";
import { StoreProvider } from "@/store/StoreProvider.js";
import { registerBaseWorkspaceServices } from "@/store/baseWorkspaceServices.js";
import { DEFAULT_LUCIDE_STROKE_WIDTH } from "@/components/icons/windowIcons.js";
import { TooltipProvider } from "@/components/ui/tooltip.js";
import { Button } from "@/components/ui/button.js";
import { AppErrorBoundary } from "@/ErrorBoundary.js";
import { ConfirmDialogHost } from "@/ConfirmDialog.js";
import { AlertDialogHost } from "@/AlertDialogHost.js";
import { ZCodeIntlProvider } from "@/i18n/IntlProvider.js";
import { V4BaseConnectionContext } from "@/v4/V4ConversationContext.js";
import { setEmployeeId } from "../identity.js";
import type { AIReqApplicationProps } from "../contract.js";
import { AIReqDataSourceProvider } from "../data-source.js";
import { AIReqProvider } from "../AIReqContext.js";
import { createRemoteAIReqDataSource } from "./remote-data-source.js";
import { AIReqShell } from "./AIReqShell.js";

export function AIReqApplication(props: AIReqApplicationProps) {
  const [identity] = useState(() => {
    setEmployeeId(props.operator.employeeNumber);
    return {
      employeeId: props.operator.employeeNumber,
      clientId: props.clientId,
    };
  });
  const composerClientNamespace = `aireq:${identity.clientId}:${identity.employeeId}`;
  const [binding, setBinding] = useState<{
    source: AIReqDataSource;
    services: typeof props.services;
  }>();
  const [error, setError] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  // 主题交由下方 StoreProvider 统一初始化和订阅，避免独立 useTheme 的旧 system 监听覆盖固定主题。
  useEffect(() => {
    let active = true;
    let owned: AIReqDataSource | undefined;
    registerBaseWorkspaceServices(props.services);
    void createRemoteAIReqDataSource(props.services, identity).then(
      (value) => {
        owned = value;
        if (active) {
          setBinding({ source: value, services: props.services });
          setError(undefined);
        } else void value.dispose();
      },
      (cause) => {
        if (active) setError(formatUserFacingError(cause, "暂时无法加载工作区，请重试。"));
      },
    );
    return () => {
      active = false;
      void owned?.dispose();
    };
  }, [props.services, identity, attempt]);
  return (
    <AppErrorBoundary>
      <ZCodeIntlProvider>
        <LucideProvider strokeWidth={DEFAULT_LUCIDE_STROKE_WIDTH}>
          <TooltipProvider>
            <ServiceProvider
              services={props.services}
              composerClientNamespace={composerClientNamespace}
            >
              <PlatformProvider platform={props.platform}>
                <StoreProvider
                  initialTheme={DEFAULT_AIREQ_THEME}
                  allowedThemes={AIREQ_THEMES}
                  broadcastService={props.services.broadcastService}
                  initialUser={{
                    id: identity.employeeId,
                    username: identity.employeeId,
                    displayName: identity.employeeId,
                  }}
                >
                  <div className="flex h-dvh min-h-0 flex-col overflow-hidden bg-background text-ui-base text-foreground">
                    {error && (
                      <div
                        role="alert"
                        className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-2 text-destructive"
                      >
                        读取失败：{error}
                        <Button variant="outline" onClick={() => setAttempt((value) => value + 1)}>
                          重试
                        </Button>
                      </div>
                    )}
                    {binding ? (
                      <AIReqDataSourceProvider source={binding.source}>
                        <AIReqProvider>
                          <V4BaseConnectionContext.Provider
                            value={{
                              key: composerClientNamespace,
                              available: props.connected && binding.services === props.services,
                            }}
                          >
                            <AIReqShell onLogout={props.operator.leave} />
                          </V4BaseConnectionContext.Provider>
                        </AIReqProvider>
                      </AIReqDataSourceProvider>
                    ) : (
                      !error && (
                        <div role="status" className="m-auto">
                          正在读取需求工作台…
                        </div>
                      )
                    )}
                  </div>
                  {/* 切换产品入口仍须保留通用弹层宿主，否则共享控件的确认 Promise 永不结算。 */}
                  <ConfirmDialogHost />
                  <AlertDialogHost />
                </StoreProvider>
              </PlatformProvider>
            </ServiceProvider>
          </TooltipProvider>
        </LucideProvider>
      </ZCodeIntlProvider>
    </AppErrorBoundary>
  );
}
