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
  const documents = groups.flatMap((group) => {
    const material = materials.find(
      (item) =>
        item.projectId === group.projectId &&
        item.irId === group.id &&
        !item.srId &&
        item.kind === "ir" &&
        item.path === group.documentPath &&
        item.valid &&
        !item.error,
    );
    return material?.content?.trim() &&
      group.files.some((file) => file.path === material.path && file.sha256 === material.sha256)
      ? [{ id: group.id, title: group.title, content: material.content }]
      : [];
  });
  const selectedDocument = documents.find((item) => item.id === irId);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" ref={trigger} disabled={disabled || !groups.length}>
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
            {zh
              ? `原始需求（CSV，${groups.length} 条）`
              : `Original requests (CSV, ${groups.length})`}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!documents.length}
            onSelect={() => {
              setIrId("");
              setOpen(true);
            }}
          >
            {documents.length
              ? zh
                ? "业务需求文档（Markdown）"
                : "Business requirements (Markdown)"
              : zh
                ? "暂无可导出的业务文档（Markdown）"
                : "No business documents to export (Markdown)"}
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
            <DialogTitle>{zh ? "导出业务需求文档" : "Export business requirements"}</DialogTitle>
            <DialogDescription>
              {zh
                ? "选择一项需求，下载其当前业务需求文档。"
                : "Select a requirement to download its current business requirements document."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="export-business-document-ir">{zh ? "需求" : "Requirement"}</Label>
            <Select value={irId || undefined} onValueChange={setIrId}>
              <SelectTrigger id="export-business-document-ir">
                <SelectValue placeholder={zh ? "选择需求" : "Choose a requirement"} />
              </SelectTrigger>
              <SelectContent>
                {documents.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.title} · {item.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {irId && !selectedDocument && (
              <p role="status" className="text-ui-sm text-foreground-subtle">
                {zh
                  ? "此文档已不可下载，请重新选择。"
                  : "This document is no longer available. Choose another."}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {zh ? "取消" : "Cancel"}
            </Button>
            <Button
              disabled={!selectedDocument}
              onClick={() => {
                if (!selectedDocument) return;
                downloadBusinessDocument(selectedDocument.content, selectedDocument.id);
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
