import { formatUserFacingError } from "@/lib/errorMessage.js";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import { SettingsFormTextarea } from "@/settings/SettingsFormTextarea.js";
import { useAIReq } from "../AIReqContext.js";
import type { AIReqRequirementGroup } from "../contract.js";

export function AIReqProposalManagement({ group }: { group: AIReqRequirementGroup }) {
  const ai = useAIReq()!;
  const [target, setTarget] = useState<"requirements" | "solution" | "test-plan">("requirements");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const submitting = useRef(false);
  const [contactDraft, setContacts] = useState<typeof group.contacts>();
  const contacts = contactDraft ?? group.contacts ?? {};
  const { setDraftNavigationGuard } = ai;
  const contactsChanged =
    contactDraft !== undefined && JSON.stringify(contacts) !== JSON.stringify(group.contacts ?? {});
  useEffect(() => {
    if (!note && !contactsChanged) return;
    setDraftNavigationGuard((navigate) => {
      if (submitting.current) return;
      if (!window.confirm("有未保存的联系人或材料修改说明，丢弃并离开？")) return;
      setNote("");
      setContacts(undefined);
      setDraftNavigationGuard(null);
      navigate();
    });
    return () => setDraftNavigationGuard(null);
  }, [note, contactsChanged, group.contacts, setDraftNavigationGuard]);
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
              onChange={(event) => setContacts({ ...contacts, [key]: event.target.value })}
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
                contacts: {
                  business: contacts.business || undefined,
                  development: contacts.development || undefined,
                  testing: contacts.testing || undefined,
                },
              });
              if (!result) throw new Error("分工保存失败；请查看上方业务错误，输入已保留。");
              setContacts(undefined);
            }, "联系人已保存。")
          }
        >
          保存联系人
        </Button>
      </fieldset>
      <div className="space-y-2">
        <label className="flex items-center gap-2">
          请求修改材料
          <select
            aria-label="修改材料范围"
            disabled={busy}
            className="rounded border border-border bg-background p-2"
            value={target}
            onChange={(event) => setTarget(event.target.value as typeof target)}
          >
            <option value="requirements">业务原始需求文档</option>
            <option value="solution">SR 方案完整包</option>
            <option value="test-plan">仅测试方案</option>
          </select>
        </label>
        <SettingsFormTextarea
          aria-label="材料修改说明"
          disabled={busy}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={3}
          placeholder="说明需要调整的内容与原因…"
        />
        <Button
          variant="outline"
          disabled={busy || !note.trim() || group.status === "requirements-pr"}
          onClick={() =>
            void perform(async () => {
              const result = await ai.command({
                type: "reviseProposalMaterial",
                projectId: group.projectId,
                irId: group.id,
                target,
                note,
              });
              if (!result) throw new Error("材料修改失败；请查看上方业务错误，输入已保留。");
              if (result.status === "completed") setNote("");
            }, "材料修改请求已提交，请查看处理结果。")
          }
        >
          提交修改请求
        </Button>
        <p>
          所有送审材料变化都撤销整包审查、终审、人工放行和三方确认；业务文档变化额外重做单评审。历史保留。
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
    </div>
  );
}
