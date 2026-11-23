import { useRef, type ReactNode } from "react";
import { Button } from "@/components/ui/button.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.js";
import { Label } from "@/components/ui/label.js";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.js";
import { SettingsFormTextarea } from "@/settings/SettingsFormTextarea.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { useAIReq } from "../AIReqContext.js";

export function AIReqProposalReleaseField({
  releaseId,
  releases,
  busy,
  onChange,
}: {
  releaseId: string;
  releases: readonly { id: string; title: string }[] | undefined;
  busy: boolean;
  onChange(id: string): void;
}) {
  const { locale } = useZCodeIntl();
  const zh = locale === "zh-CN";
  return (
    <div className="space-y-2">
      <Label>{zh ? "所属版本" : "Release"}</Label>
      <Select
        value={releases?.some((release) => release.id === releaseId) ? releaseId : ""}
        disabled={busy || !releases?.length}
        onValueChange={onChange}
      >
        <SelectTrigger aria-label={zh ? "选择所属 Release" : "Choose a Release"}>
          <SelectValue placeholder={zh ? "选择具体 Release" : "Choose a Release"} />
        </SelectTrigger>
        <SelectContent>
          {releases?.map((release) => (
            <SelectItem key={release.id} value={release.id}>
              {release.title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {!releases ? (
        <p role="status" className="text-ui-sm text-foreground-subtle">
          {zh ? "正在读取 Release…" : "Loading releases…"}
        </p>
      ) : !releases.length ? (
        <p className="text-ui-sm text-foreground-subtle">
          {zh
            ? "当前项目尚无 Release，请关闭弹窗并在项目配置中添加。"
            : "This project has no Releases. Close this dialog and add one in project settings."}
        </p>
      ) : null}
    </div>
  );
}

export function AIReqProposalCreateDialog({
  busy,
  ready,
  hasReleases,
  releaseField,
  text,
  onTextChange,
  onClose,
  onCloseAutoFocus,
  onRetry,
  onSave,
}: {
  busy: boolean;
  ready: boolean;
  hasReleases: boolean;
  releaseField: ReactNode;
  text: string;
  onTextChange(value: string): void;
  onClose(): void;
  onCloseAutoFocus(event: Event): void;
  onRetry(): void;
  onSave(): void;
}) {
  const ai = useAIReq()!;
  const { locale } = useZCodeIntl();
  const zh = locale === "zh-CN";
  const originalInput = useRef<HTMLTextAreaElement>(null);
  const sourceIrId = ai.proposalDraft?.sourceIrId;
  const sourceDocument = ai.view?.requirements.find(
    (item) => item.archive && item.id === sourceIrId && item.projectId === ai.selection.projectId,
  );
  const sourceRelease = ai.view?.releases.find(
    (item) => item.id === sourceDocument?.releaseId && item.projectId === sourceDocument?.projectId,
  );
  return (
    <Dialog
      open={Boolean(ai.proposalDraft)}
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      {/* 修复：通用弹窗默认按视口铺满；新建需求使用与导入一致的限宽和多行编辑区。 */}
      <DialogContent
        className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl"
        onOpenAutoFocus={(event) => {
          if (!ready || !originalInput.current) return;
          event.preventDefault();
          originalInput.current.focus();
        }}
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <DialogHeader>
          <DialogTitle>{zh ? "新建需求" : "New requirement"}</DialogTitle>
          <DialogDescription>
            {zh
              ? "原始需求保存后成为提案。你可以稍后开始需求澄清。"
              : "The original request is saved as a proposal. You can then start clarification."}
            {sourceDocument &&
              (zh
                ? ` 来源文档「${sourceDocument.title}」`
                : ` Source document: ${sourceDocument.title}`)}
            {sourceDocument && sourceRelease && ` · ${sourceRelease.title}`}
          </DialogDescription>
        </DialogHeader>
        {releaseField}
        <div className="space-y-2">
          <Label htmlFor="new-proposal-text">{zh ? "原始需求" : "Original request"}</Label>
          <SettingsFormTextarea
            ref={originalInput}
            id="new-proposal-text"
            className="field-sizing-fixed min-h-32"
            rows={6}
            value={text}
            disabled={busy || !hasReleases}
            onChange={(event) => onTextChange(event.target.value)}
          />
          {!ready && hasReleases && (
            <p className="text-ui-sm text-foreground-subtle">
              {zh ? "请选择所属 Release 后保存。" : "Choose a Release before saving."}
            </p>
          )}
        </div>
        {ai.error && (
          <div className="space-y-2">
            <p role="alert" className="text-ui-sm text-destructive">
              {ai.error}
            </p>
            <Button variant="outline" disabled={busy} onClick={onRetry}>
              {zh ? "重新读取版本并保留输入" : "Reload version and keep input"}
            </Button>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            {zh ? "取消" : "Cancel"}
          </Button>
          <Button disabled={!ready || !text.trim() || busy} onClick={onSave}>
            {zh ? "保存为提案" : "Save as proposal"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
