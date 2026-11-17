import { useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.js";
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
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import type { AIReqMaterialView, AIReqRequirementGroup } from "../contract.js";
import { downloadProposalCsv } from "./proposal-csv.js";
import { downloadBusinessDocument } from "./proposal-markdown.js";

export function AIReqProposalExport({
  groups,
  materials,
  disabled,
}: {
  groups: readonly AIReqRequirementGroup[];
  materials: readonly AIReqMaterialView[];
  disabled: boolean;
}) {
  const { locale } = useZCodeIntl();
  const zh = locale === "zh-CN";
  const [open, setOpen] = useState(false);
  const [irId, setIrId] = useState("");
  const trigger = useRef<HTMLButtonElement>(null);
  const group = groups.find((item) => item.id === irId);
  const material =
    group &&
    materials.find(
      (item) =>
        item.projectId === group.projectId &&
        item.irId === group.id &&
        !item.srId &&
        item.kind === "ir" &&
        item.path === group.documentPath,
    );
  const problem = !group
    ? zh
      ? "请选择要导出的 IR。"
      : "Choose an IR to export."
    : !material
      ? zh
        ? "该 IR 尚未生成业务需求文档。"
        : "This IR has no business requirements document yet."
      : material.error
        ? zh
          ? "文档读取失败，请在需求中重试读取。"
          : "Document reading failed. Retry it in the requirement."
        : !material.valid ||
            !group.files.some(
              (file) => file.path === material.path && file.sha256 === material.sha256,
            )
          ? zh
            ? "当前业务需求文档已失效，不能导出。"
            : "The current business document is invalid and cannot be exported."
          : !material.content?.trim()
            ? zh
              ? "当前业务需求文档没有可读取的正文。"
              : "The current business document has no readable content."
            : "";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" ref={trigger} disabled={disabled}>
            {zh ? "导出" : "Export"}
            <ChevronDown aria-hidden="true" className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onSelect={() =>
              downloadProposalCsv(
                groups.map((item) => item.originalText),
                "需求提案.csv",
              )
            }
          >
            {zh ? "原始需求（CSV）" : "Original requests (CSV)"}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!groups.length}
            onSelect={() => {
              setIrId("");
              setOpen(true);
            }}
          >
            {zh ? "IR 业务需求文档（Markdown）" : "IR business requirements (Markdown)"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="sm:max-w-lg"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            trigger.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {zh ? "导出 IR 业务需求文档" : "Export IR business requirements"}
            </DialogTitle>
            <DialogDescription>
              {zh
                ? "选择当前筛选范围内的一项 IR，仅下载其当前业务需求正文，不包含其他材料。"
                : "Choose an IR in the filtered results. Only its current business document is downloaded."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="export-business-document-ir">{zh ? "需求 IR" : "Requirement IR"}</Label>
            <Select value={irId || undefined} onValueChange={setIrId}>
              <SelectTrigger id="export-business-document-ir">
                <SelectValue placeholder={zh ? "选择需求" : "Choose a requirement"} />
              </SelectTrigger>
              <SelectContent>
                {groups.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.title} · {item.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {problem && (
              <p role="status" className="text-ui-sm text-foreground-subtle">
                {problem}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {zh ? "取消" : "Cancel"}
            </Button>
            <Button
              disabled={Boolean(problem)}
              onClick={() => {
                if (problem || !material?.content || !group) return;
                downloadBusinessDocument(material.content, group.id);
                setOpen(false);
              }}
            >
              {zh ? "下载 Markdown" : "Download Markdown"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
