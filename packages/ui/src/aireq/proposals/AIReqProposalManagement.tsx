import { formatUserFacingError } from "@/lib/errorMessage.js";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import { SettingsFormTextarea } from "@/settings/SettingsFormTextarea.js";
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
import { getEmployeeId } from "../identity.js";
import { hasProjectRole, type AIReqRequirementGroup } from "../contract.js";

export function AIReqProposalManagement({
  group,
  returnDraft,
}: {
  group: AIReqRequirementGroup;
  returnDraft: { dirty: boolean; busy: boolean; discard: () => void };
}) {
  const ai = useAIReq()!;
  const development = hasProjectRole(ai.view, group.projectId, getEmployeeId(), "development");
  const testing = hasProjectRole(ai.view, group.projectId, getEmployeeId(), "testing");
  const [target, setTarget] = useState<"requirements" | "solution" | "test-plan">("requirements");
  const [note, setNote] = useState("");
  const [noteRevision, setNoteRevision] = useState<number>();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const submitting = useRef(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const pendingNavigation = useRef<(() => void) | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const [contactDraft, setContacts] = useState<typeof group.contacts>();
  const [contactRevision, setContactRevision] = useState<number>();
  const contacts = contactDraft ?? group.contacts ?? {};
  const { setDraftNavigationGuard } = ai;
  const contactsChanged =
    contactDraft !== undefined && JSON.stringify(contacts) !== JSON.stringify(group.contacts ?? {});
  useEffect(() => {
    if (!note && !contactsChanged && !busy && !returnDraft.dirty && !returnDraft.busy) return;
    setDraftNavigationGuard((navigate) => {
      if (submitting.current || returnDraft.busy || pendingNavigation.current) return;
      // 浏览器 confirm 不参与应用覆盖层焦点管理；沿用应用内确认并只接纳一次原导航。
      pendingNavigation.current = navigate;
      returnFocus.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setDiscardOpen(true);
    });
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      setDraftNavigationGuard(null);
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, [note, contactsChanged, busy, group.contacts, setDraftNavigationGuard, returnDraft]);
  const perform = async (action: () => unknown | Promise<unknown>, success: string) => {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setFeedback("");
    try {
      await action();
      setFeedback(success);
    } catch (error) {
      setFeedback(formatUserFacingError(error, "操作未完成，输入已保留，请重试。"));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };
  return (
    <div className="space-y-4">
      <fieldset className="space-y-2">
        <legend>IR 联系人（空值为待认领，不限制代办）</legend>
        {/* 标签在弹性布局中被压缩会拆开末字，保持完整文字并让输入框使用剩余宽度。 */}
        {(
          [
            ["business", "业务"],
            ["development", "开发"],
            ["testing", "测试"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="flex items-center gap-2">
            <span className="shrink-0 whitespace-nowrap">{label}联系人</span>
            <Input
              aria-label={`${label}联系人`}
              disabled={busy}
              value={contacts[key] ?? ""}
              placeholder="未分配"
              onChange={(event) => {
                // command 默认使用最新投影版本；旧联系人副本必须携带原编辑基线，防止覆盖并发更新。
                if (contactDraft === undefined) setContactRevision(ai.view?.revision);
                setContacts({ ...contacts, [key]: event.target.value });
              }}
            />
          </label>
        ))}
        <Button
          variant="outline"
          disabled={
            busy ||
            Object.values(contacts).some(
              (value) => Boolean(value) && !/^[a-z][0-9]{8}$/.test(value!),
            )
          }
          onClick={() =>
            void perform(async () => {
              const result = await ai.command({
                type: "assignContacts",
                projectId: group.projectId,
                irId: group.id,
                expectedRevision: contactRevision ?? ai.view?.revision,
                contacts: {
                  business: contacts.business || undefined,
                  development: contacts.development || undefined,
                  testing: contacts.testing || undefined,
                },
              });
              if (!result) throw new Error("分工保存失败；请查看上方业务错误，输入已保留。");
              setContacts(undefined);
              setContactRevision(undefined);
            }, "联系人已保存。")
          }
        >
          保存联系人
        </Button>
        {contactDraft !== undefined && (
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => {
              setContacts(undefined);
              setContactRevision(undefined);
              setFeedback("");
            }}
          >
            放弃联系人修改
          </Button>
        )}
      </fieldset>
      <div className="space-y-2">
        <label className="flex flex-wrap items-center gap-2">
          请求修改材料
          <select
            aria-label="修改材料范围"
            disabled={busy}
            className="min-w-0 max-w-full rounded border border-border bg-background p-2"
            value={target}
            onChange={(event) => setTarget(event.target.value as typeof target)}
          >
            <option value="requirements">业务原始需求文档</option>
            {development && <option value="solution">SR 方案完整包</option>}
            {(development || testing) && <option value="test-plan">仅测试方案</option>}
          </select>
        </label>
        <SettingsFormTextarea
          aria-label="材料修改说明"
          readOnly={busy}
          value={note}
          onChange={(event) => {
            const value = event.target.value;
            if (!value) setNoteRevision(undefined);
            else if (noteRevision === undefined) setNoteRevision(ai.view?.revision);
            setNote(value);
          }}
          rows={3}
          placeholder="说明需要调整的内容与原因…"
        />
        <Button
          variant="outline"
          disabled={
            busy ||
            ai.pending ||
            !note.trim() ||
            (target === "solution" && !development) ||
            (target === "test-plan" && !development && !testing) ||
            noteRevision === undefined ||
            noteRevision !== ai.view?.revision ||
            group.status === "requirements-pr"
          }
          onClick={() =>
            void perform(async () => {
              const result = await ai.command({
                type: "reviseProposalMaterial",
                projectId: group.projectId,
                irId: group.id,
                expectedRevision: noteRevision,
                target,
                note,
              });
              if (!result) throw new Error("材料修改失败；请查看上方业务错误，输入已保留。");
              if (result.status === "completed") {
                setNote("");
                setNoteRevision(undefined);
              }
            }, "材料修改请求已提交，请查看处理结果。")
          }
        >
          提交修改请求
        </Button>
        {note.trim() && noteRevision !== ai.view?.revision && (
          <div className="flex flex-wrap items-center gap-2 text-ui-sm">
            <p role="status" className="text-foreground-subtle">
              当前需求记录已更新，旧版修改说明仍保留。
            </p>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy || ai.pending || !ai.view}
              onClick={() => setNoteRevision(ai.view?.revision)}
            >
              已核对当前版本，保留说明
            </Button>
          </div>
        )}
        <p>
          方案材料更新后重新校验、审查和三方确认；若修改业务需求文档，还需重新评审并确认需求。旧记录仅供追溯。
        </p>
      </div>
      {Boolean(group.rejectedReviewResults?.length) && (
        <section className="space-y-2 border-t border-border pt-3" aria-label="旧评审结果拒绝记录">
          <h3 className="font-medium">旧版本评审结果未采纳</h3>
          {group.rejectedReviewResults?.map((entry, index) => {
            const review = [
              group.originalReview,
              group.review,
              ...(group.originalReviewHistory ?? []),
              ...(group.reviewHistory ?? []),
            ].find((item) => item?.id === entry.reviewId);
            return (
              <div key={`${entry.reviewId}:${entry.at}:${index}`} className="space-y-1 break-all">
                <p role="status">拒绝原因：{entry.reason}</p>
                <p>评审：{entry.reviewId}</p>
                <p>
                  材料版本：{review?.snapshotDigest ?? "该轮材料版本记录不可用，不能作为批准依据。"}
                </p>
                <time dateTime={entry.at}>
                  {new Date(entry.at).toLocaleString("zh-CN", {
                    timeZone: "Asia/Shanghai",
                    hour12: false,
                  })}
                  （北京时间）
                </time>
              </div>
            );
          })}
        </section>
      )}
      {feedback && (
        <p role="status" className="whitespace-pre-wrap">
          {feedback}
        </p>
      )}
      <AlertDialog
        open={discardOpen}
        onOpenChange={(open) => {
          setDiscardOpen(open);
          if (!open) pendingNavigation.current = null;
        }}
      >
        <AlertDialogContent
          onCloseAutoFocus={(event) => {
            // 受控确认没有 Trigger；取消导航后必须由草稿 owner 归还原控件焦点。
            if (returnFocus.current?.isConnected) {
              event.preventDefault();
              returnFocus.current.focus({ preventScroll: true });
            }
            returnFocus.current = null;
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>丢弃未保存的修改？</AlertDialogTitle>
            <AlertDialogDescription>
              联系人、材料修改说明或退回原因尚未保存。继续编辑将保留输入。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>继续编辑</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                const navigate = pendingNavigation.current;
                pendingNavigation.current = null;
                returnFocus.current = null;
                setNote("");
                setNoteRevision(undefined);
                setContacts(undefined);
                setContactRevision(undefined);
                returnDraft.discard();
                setDraftNavigationGuard(null);
                navigate?.();
              }}
            >
              丢弃并离开
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
