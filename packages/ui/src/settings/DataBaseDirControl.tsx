import { FolderOpen, LoaderCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { isDataBaseDirForbiddenWindowsInstallDirError } from "@zcode/shared";
import {
  TID_SETTINGS_DATA_BASE_DIR_BROWSE,
  TID_SETTINGS_DATA_BASE_DIR_INPUT,
  TID_SETTINGS_DATA_BASE_DIR_SAVE,
  TID_SETTINGS_DATA_BASE_DIR_STATUS,
} from "@zcode/shared/test-ids";
import { Button } from "@/components/ui/button.js";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog.js";
import { Input } from "@/components/ui/input.js";
import { DirectoryBrowser } from "@/DirectoryBrowser.js";
import { useBaseWorkspaceServices } from "@/hooks/useWorkspaceServices.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";

export function DataBaseDirControl({
  dataBaseDir,
  defaultHomeDir,
  onDataBaseDirChange,
}: {
  dataBaseDir: string;
  defaultHomeDir: string;
  onDataBaseDirChange: (dir: string) => Promise<void>;
}) {
  const { intl } = useZCodeIntl();
  const services = useBaseWorkspaceServices();
  const projectService = services.projectService;
  const directoryBrowserServices = useMemo(
    () =>
      projectService
        ? {
            systemService: {
              info: async () => ({
                homedir: (await projectService.readDirectory()).path,
              }),
            },
            fileService: {
              readdir: async (params: { path: string; includeHidden?: boolean }) =>
                (await projectService.readDirectory(params)).entries,
            },
          }
        : null,
    [projectService],
  );
  const [browserOpen, setBrowserOpen] = useState(false);
  const effectiveDir = dataBaseDir || defaultHomeDir;
  const [localDataBaseDir, setLocalDataBaseDir] = useState(effectiveDir);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errorMessageId, setErrorMessageId] = useState("settings.dataBaseDirCopyFailed");

  useEffect(() => {
    if (saveState !== "saved") {
      setLocalDataBaseDir(effectiveDir);
    }
  }, [effectiveDir, saveState]);

  const isDirty = localDataBaseDir.trim() !== effectiveDir;
  const isSaving = saveState === "saving";

  const handleBrowseDataBaseDir = useCallback(() => {
    // 浏览器不暴露系统绝对路径：唯一入口是服务端真实目录浏览（Chrome/Firefox 同一 RPC）。
    if (directoryBrowserServices) setBrowserOpen(true);
  }, [directoryBrowserServices]);

  const handleSave = useCallback(async () => {
    const trimmed = localDataBaseDir.trim();
    const newValue = trimmed === defaultHomeDir ? "" : trimmed;
    setSaveState("saving");
    try {
      await onDataBaseDirChange(newValue);
      setSaveState("saved");
    } catch (error) {
      setErrorMessageId(
        isDataBaseDirForbiddenWindowsInstallDirError(error)
          ? "settings.dataBaseDirForbiddenInstallDir"
          : "settings.dataBaseDirCopyFailed",
      );
      setSaveState("error");
    }
  }, [defaultHomeDir, localDataBaseDir, onDataBaseDirChange]);

  return (
    <>
      <div className="flex w-[320px] min-w-0 flex-col gap-2">
        <div className="flex items-center gap-2">
          <FolderOpen className="size-4 shrink-0 text-foreground-subtle" />
          <Input
            size="lg"
            data-testid={TID_SETTINGS_DATA_BASE_DIR_INPUT}
            value={localDataBaseDir}
            readOnly
            disabled={isSaving}
            placeholder={intl.formatMessage({ id: "settings.dataBaseDirPlaceholder" })}
            className="flex-1 font-mono"
          />
        </div>
        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-testid={TID_SETTINGS_DATA_BASE_DIR_BROWSE}
            disabled={isSaving}
            onClick={handleBrowseDataBaseDir}
          >
            {intl.formatMessage({ id: "settings.dataBaseDirBrowse" })}
          </Button>
          <Button
            type="button"
            size="sm"
            data-testid={TID_SETTINGS_DATA_BASE_DIR_SAVE}
            disabled={!isDirty || isSaving}
            onClick={() => void handleSave()}
          >
            {isSaving ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              intl.formatMessage({ id: "settings.dataBaseDirSave" })
            )}
          </Button>
        </div>
        {saveState === "saving" ? (
          <p
            data-testid={TID_SETTINGS_DATA_BASE_DIR_STATUS}
            data-state="saving"
            className="text-ui-base text-foreground-subtle"
          >
            {intl.formatMessage({ id: "settings.dataBaseDirCopying" })}
          </p>
        ) : saveState === "saved" ? (
          <p
            data-testid={TID_SETTINGS_DATA_BASE_DIR_STATUS}
            data-state="saved"
            className="text-ui-base text-amber-600 dark:text-amber-400"
          >
            {intl.formatMessage({ id: "settings.dataBaseDirRestartRequired" })}
          </p>
        ) : saveState === "error" ? (
          <p
            data-testid={TID_SETTINGS_DATA_BASE_DIR_STATUS}
            data-state="error"
            className="text-ui-base text-destructive"
          >
            {intl.formatMessage({ id: errorMessageId })}
          </p>
        ) : null}
      </div>
      {directoryBrowserServices ? (
        <Dialog open={browserOpen} onOpenChange={setBrowserOpen}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>{intl.formatMessage({ id: "directoryBrowser.title" })}</DialogTitle>
            </DialogHeader>
            <div className="flex h-96 min-h-0 flex-col">
              <DirectoryBrowser
                embedded
                showSelectionActions
                selectLabel={intl.formatMessage({ id: "directoryBrowser.selectDir" })}
                services={directoryBrowserServices}
                onSelect={(path) => {
                  setLocalDataBaseDir(path);
                  if (saveState !== "idle") setSaveState("idle");
                  setBrowserOpen(false);
                }}
                onCancel={() => setBrowserOpen(false)}
              />
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}
