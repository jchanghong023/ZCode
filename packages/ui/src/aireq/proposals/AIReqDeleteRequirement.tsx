import { useAIReqDataSource } from "../data-source.js";
import { useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button.js";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog.js";
import { useAIReq } from "../AIReqContext.js";
import {
  proposalProgressIndex,
  proposalViewedIndex,
  type AIReqRequirementGroup,
} from "../contract.js";

/** Removal is performed by the injected source; sample and host persistence remain isolated. */
export function AIReqDeleteRequirement({
  group: menuGroup,
  renderTrigger,
}: {
  group: AIReqRequirementGroup;
  renderTrigger?: (openDelete?: () => void, prohibition?: string) => ReactNode;
}) {
  const source = useAIReqDataSource();
  const aireq = useAIReq()!;
  const [target, setTarget] = useState<{ projectId: string; irId: string }>();
  const [deleting, setDeleting] = useState(false);
  const inFlight = useRef(false);
  const { selection, view } = aireq;
  // 菜单展示对象与命令目标必须同 scope；不能把旧弹窗套到后来选择的另一条提案。
  const group = view?.drafts.find(
    (item) =>
      item.id === menuGroup.id &&
      item.projectId === menuGroup.projectId &&
      item.id === selection.irId &&
      item.projectId === selection.projectId,
  );
  if (
    !source.capabilities.workflowCommands.includes("deleteRequirement") ||
    !group ||
    selection.srId ||
    group.status === "formal" ||
    view?.groups.some((item) => item.id === group.id && item.projectId === group.projectId)
  )
    return <>{renderTrigger?.()}</>;
  const started = view?.srs.some(
    (sr) => sr.projectId === group.projectId && sr.irId === group.id && sr.status !== "pending",
  );
  const history = proposalViewedIndex(group, selection) !== proposalProgressIndex(group, selection);
  const prohibition =
    group.merge || group.proposalRevisions?.length || group.status === "frozen" || started
      ? "已入库的正式提案、修订及开发历史保留展示；只能移除允许删除的草稿。"
      : history
        ? "正在查看历史环节，仅供只读查看；请返回当前操作环节。"
        : undefined;
  const targetMatches = target?.projectId === group.projectId && target.irId === group.id;
  const openDelete = () => {
    if (!prohibition && !inFlight.current)
      setTarget({ projectId: group.projectId, irId: group.id });
  };
  const remove = async () => {
    if (!targetMatches || prohibition || inFlight.current) return;
    // command 不提供写入单飞；同步锁覆盖 React 尚未重渲染的连续点击窗口。
    inFlight.current = true;
    setDeleting(true);
    try {
      const result = await aireq.command({
        type: "deleteRequirement",
        version: 1,
        projectId: group.projectId,
        irId: group.id,
      });
      if (result?.status === "completed") setTarget(undefined);
    } finally {
      inFlight.current = false;
      setDeleting(false);
    }
  };
  return (
    <>
      {renderTrigger ? (
        renderTrigger(openDelete, prohibition)
      ) : (
        <Button
          size="sm"
          variant="outline"
          data-testid="delete-requirement"
          disabled={!!prohibition || deleting}
          title={prohibition}
          onClick={openDelete}
        >
          删除需求
        </Button>
      )}
      <AlertDialog
        open={targetMatches}
        onOpenChange={(open) => {
          if (!open && !inFlight.current) setTarget(undefined);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>移除需求“{group.title}”？</AlertDialogTitle>
            <AlertDialogDescription>
              删除后将无法继续处理这条需求，请确认后再操作。
            </AlertDialogDescription>
          </AlertDialogHeader>
          {aireq.error && (
            <p role="alert" className="text-ui-sm text-destructive">
              {aireq.error}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="delete-requirement-cancel" disabled={deleting}>
              取消
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              data-testid="delete-requirement-confirm"
              disabled={deleting || !!prohibition || !targetMatches}
              onClick={(event) => {
                event.preventDefault();
                void remove();
              }}
            >
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
