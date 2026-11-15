import { useState } from "react";
import { createUuid } from "@zcode/shared";
import {
  ISSUE_TYPES,
  type AIReqIssue,
  type AIReqIssueInput,
  type AIReqIssueScope,
  type AIReqIssueServices,
} from "../../contract.js";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import { Label } from "@/components/ui/label.js";
import { Textarea } from "@/components/ui/textarea.js";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.js";
import { useAIReq } from "../../AIReqContext.js";
import { useAIReqDataSource } from "../../data-source.js";
import { getEmployeeId, isEmployeeId } from "../../identity.js";
import { BranchCopy } from "../BranchCopy.js";
import { IssuePageHeading, IssueSelect, priorityLabels, type MutationProps } from "./shared.js";

export function CreateIssue({
  scope,
  service,
  pending,
  mutate,
  onMessage,
}: {
  scope: AIReqIssueScope;
  service: AIReqIssueServices;
  onMessage(value: string): void;
} & MutationProps) {
  const aireq = useAIReq()!;
  const source = useAIReqDataSource();
  const [requestId, setRequestId] = useState(() => createUuid());
  const [title, setTitle] = useState("");
  const [type, setType] = useState<AIReqIssueInput["type"]>("bug");
  const [priority, setPriority] = useState<AIReqIssueInput["priority"]>("normal");
  const [description, setDescription] = useState("");
  const [acceptance, setAcceptance] = useState("");
  const [developer, setDeveloper] = useState("");
  const [requirement, setRequirement] = useState("none");
  const [created, setCreated] = useState<AIReqIssue>();
  const groups = aireq.view?.groups.filter((group) => group.projectId === scope.projectId) ?? [];
  const relations: { key: string; irId: string; srId?: string; title: string }[] = groups.flatMap(
    (group) => [
      { key: group.id, irId: group.id, title: `${group.id} · ${group.title}` },
      ...(aireq.view?.srs
        .filter((sr) => sr.projectId === scope.projectId && sr.irId === group.id)
        .map((sr) => ({
          key: `${group.id}/${sr.id}`,
          irId: group.id,
          srId: sr.id,
          title: `${sr.id} · ${sr.title}`,
        })) ?? []),
    ],
  );
  const relation = relations.find((item) => item.key === requirement);
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-4 md:px-6 md:py-6">
        <IssuePageHeading page="issueCreate" scope={scope} />
        {created ? (
          <section
            className="space-y-4 rounded-lg border border-border p-4"
            aria-label="Issue 创建结果"
          >
            <h2 className="break-words font-medium">
              {created.id} · {created.title}
            </h2>
            <p className="text-foreground-subtle">
              Issue 已创建；分支为平台模拟映射，未推送真实 Git。可复制分支或查看进度。
            </p>
            <BranchCopy branch={created.branch} onMessage={onMessage} />
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => aireq.setMainView("issueProgress")}>查看 Issue 进度</Button>
              <Button
                variant="outline"
                onClick={() => {
                  setCreated(undefined);
                  setTitle("");
                  setDescription("");
                  setAcceptance("");
                  setRequestId(createUuid());
                }}
              >
                继续新建
              </Button>
            </div>
          </section>
        ) : (
          <form
            className="space-y-5"
            onSubmit={(event) => {
              event.preventDefault();
              void mutate(async () => {
                const value = await service.create({
                  ...scope,
                  requestId,
                  title,
                  type,
                  priority,
                  description,
                  acceptance,
                  developerEmployeeId: developer,
                  requirement: relation ? { irId: relation.irId, srId: relation.srId } : undefined,
                });
                setCreated(value);
              }, "");
            }}
          >
            <fieldset disabled={pending || !isEmployeeId(getEmployeeId())} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="issue-title">
                  标题<span aria-hidden="true">*</span>
                </Label>
                <Input
                  id="issue-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="简要描述需要解决的问题"
                  required
                  maxLength={200}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <IssueSelect
                  id="issue-type"
                  label="类型"
                  value={type}
                  onChange={(value) => setType(value as AIReqIssueInput["type"])}
                >
                  {Object.entries(ISSUE_TYPES).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </IssueSelect>
                <IssueSelect
                  id="issue-priority"
                  label="优先级"
                  value={priority}
                  onChange={(value) => setPriority(value as AIReqIssueInput["priority"])}
                >
                  {Object.entries(priorityLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </IssueSelect>
              </div>
              <div className="space-y-2">
                <Label htmlFor="issue-description">
                  问题说明<span aria-hidden="true">*</span>
                </Label>
                <Textarea
                  id="issue-description"
                  className="min-h-32"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  required
                  rows={5}
                  placeholder="描述当前表现、期望结果，以及复现步骤或需要调整的范围"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="issue-acceptance">
                  完成标准<span aria-hidden="true">*</span>
                </Label>
                <Textarea
                  id="issue-acceptance"
                  className="min-h-24"
                  value={acceptance}
                  onChange={(event) => setAcceptance(event.target.value)}
                  required
                  rows={3}
                  placeholder="说明满足哪些条件后，可以确认此 Issue 已完成"
                />
              </div>
              <div className="min-w-0 space-y-2">
                <Label htmlFor="issue-developer">
                  开发人员<span aria-hidden="true">*</span>
                </Label>
                <Select required value={developer} onValueChange={setDeveloper}>
                  <SelectTrigger id="issue-developer" className="w-full" aria-required="true">
                    <SelectValue placeholder="选择一位开发人员" />
                  </SelectTrigger>
                  <SelectContent>
                    {source.employeeDirectory?.entries.map((person) => (
                      <SelectItem key={person.employeeId} value={person.employeeId}>
                        {person.name} · {person.employeeId}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <IssueSelect
                id="issue-requirement"
                label="关联需求（可选）"
                value={requirement}
                onChange={setRequirement}
              >
                <SelectItem value="none">不关联，独立跟踪</SelectItem>
                {relations.map((item) => (
                  <SelectItem key={item.key} value={item.key}>
                    {item.title}
                  </SelectItem>
                ))}
              </IssueSelect>
              <Button
                type="submit"
                disabled={
                  pending ||
                  !title.trim() ||
                  !description.trim() ||
                  !acceptance.trim() ||
                  !developer ||
                  (requirement !== "none" && !relation)
                }
              >
                {pending ? "正在创建…" : "创建 Issue"}
              </Button>
            </fieldset>
          </form>
        )}
      </div>
    </div>
  );
}
