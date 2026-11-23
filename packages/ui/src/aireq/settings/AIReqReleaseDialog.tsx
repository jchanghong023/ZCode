import { Button } from "@/components/ui/button.js";
import { useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.js";
import { Input } from "@/components/ui/input.js";
import { Label } from "@/components/ui/label.js";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.js";
import type { AIReqProject } from "../contract.js";

export function AIReqReleaseDialog({
  open,
  onOpenChange,
  onCloseAutoFocus,
  projects,
  releaseProjectId,
  releaseTitle,
  releaseError,
  releaseSaving,
  canSave,
  zh,
  onProjectChange,
  onTitleChange,
  onCancel,
  onSubmit,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  onCloseAutoFocus(event: Event): void;
  projects: AIReqProject[];
  releaseProjectId: string;
  releaseTitle: string;
  releaseError: string;
  releaseSaving: boolean;
  canSave: boolean;
  zh: boolean;
  onProjectChange(value: string): void;
  onTitleChange(value: string): void;
  onCancel(): void;
  onSubmit(): void;
}) {
  const titleInput = useRef<HTMLInputElement>(null);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Release 同样将正文约束在视口内，避免大字号时主要动作被裁切。 */}
      <DialogContent
        className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden sm:max-w-lg"
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <DialogHeader className="shrink-0 pr-8">
          <DialogTitle>{zh ? "添加 Release" : "Add release"}</DialogTitle>
          <DialogDescription>
            {zh ? "用于归集同一项目版本的需求。" : "Group requirements for a project release."}
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex min-h-0 flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canSave) return;
            // 发送后提交按钮会禁用；名称输入只读且保留焦点，同名失败后可直接修正。
            titleInput.current?.focus();
            onSubmit();
          }}
        >
          <div className="min-h-0 space-y-4 overflow-y-auto">
            <div className="space-y-2">
              <Label htmlFor="release-project">{zh ? "所属项目" : "Project"}</Label>
              <Select
                value={releaseProjectId}
                disabled={releaseSaving}
                onValueChange={onProjectChange}
              >
                <SelectTrigger id="release-project" size="lg" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="release-name">
                {zh ? "Release 名称" : "Release name"}
                <span aria-hidden="true" className="text-destructive">
                  {" "}
                  *
                </span>
              </Label>
              <Input
                ref={titleInput}
                id="release-name"
                placeholder={
                  zh
                    ? "例如：2027.01 · 支付体验优化"
                    : "For example, 2027.01 · Payment improvements"
                }
                value={releaseTitle}
                readOnly={releaseSaving}
                onChange={(event) => onTitleChange(event.target.value)}
                aria-invalid={Boolean(releaseError) || undefined}
                aria-describedby={releaseError ? "release-name-error" : undefined}
                required
              />
            </div>
            {releaseError && (
              <p id="release-name-error" role="alert" className="text-ui-sm text-destructive">
                {releaseError}
              </p>
            )}
          </div>
          <DialogFooter className="shrink-0">
            <Button type="button" variant="outline" disabled={releaseSaving} onClick={onCancel}>
              {zh ? "取消" : "Cancel"}
            </Button>
            <Button type="submit" disabled={!canSave}>
              {releaseSaving ? (zh ? "保存中…" : "Saving…") : zh ? "添加 Release" : "Add release"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
