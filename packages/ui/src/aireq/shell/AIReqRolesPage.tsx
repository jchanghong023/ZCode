import { Plus } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button.js";
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
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { useAIReq } from "../AIReqContext.js";
import { hasProjectRole, type AIReqProjectRole } from "../contract.js";
import { getEmployeeId } from "../identity.js";
import { AIREQ_PAGE_CONTENT_CLASSNAME, AIREQ_PAGE_TITLE_CLASSNAME } from "./pageLayout.js";

const roles = ["development", "testing"] as const;
type RoleEdit =
  | { type: "addProjectRoleMember"; role: AIReqProjectRole }
  | { type: "removeProjectRoleMember"; role: AIReqProjectRole; employeeId: string };

export function AIReqRolesPage() {
  const ai = useAIReq()!;
  const { locale } = useZCodeIntl();
  const zh = locale === "zh-CN";
  const [chosenProject, setChosenProject] = useState<string>();
  const [edit, setEdit] = useState<RoleEdit>();
  const [employee, setEmployee] = useState("");
  const [error, setError] = useState("");
  const [requestFailed, setRequestFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const addButtons = useRef<Partial<Record<AIReqProjectRole, HTMLButtonElement>>>({});
  const returnFocus = useRef<{ role: AIReqProjectRole; trigger: HTMLButtonElement } | null>(null);
  const projects = ai.view?.projects ?? [];
  const project =
    projects.find((item) => item.id === (chosenProject ?? ai.selection.projectId)) ?? projects[0];
  const administrator = ai.view?.roleAdministrator === true;
  const currentEmployee = getEmployeeId();
  // 复用业务入口的角色判断，管理员的隐含权限与当前项目名单使用同一口径。
  const currentRoles = roles.filter((role) =>
    hasProjectRole(ai.view, project?.id, currentEmployee, role),
  );
  const roleNames = currentRoles.map((role) =>
    role === "development" ? (zh ? "开发" : "Developer") : zh ? "测试" : "Tester",
  );
  const roleSummary = administrator
    ? zh
      ? "管理员（拥有开发与测试权限）"
      : "Administrator (developer and tester permissions)"
    : roleNames.join(zh ? "、" : ", ") ||
      (zh ? "未加入开发或测试名单" : "No developer or tester role");
  const canEdit = administrator && Boolean(project) && ai.selectionReady && !ai.pending && !busy;
  const deleting = edit?.type === "removeProjectRoleMember" ? edit : undefined;
  const roleTitle = (role: AIReqProjectRole) =>
    role === "development" ? (zh ? "开发名单" : "Developers") : zh ? "测试名单" : "Testers";
  const errorMessage = requestFailed
    ? (ai.error ?? (zh ? "名单修改失败，请重试。" : "Could not update the list. Try again."))
    : error;

  function startEdit(action: RoleEdit, trigger: HTMLButtonElement) {
    if (!canEdit || submitting.current) return;
    returnFocus.current = { role: action.role, trigger };
    setEdit(action);
    setEmployee("");
    setError("");
    setRequestFailed(false);
  }

  function restoreFocus() {
    const target = returnFocus.current;
    if (!target) return;
    returnFocus.current = null;
    requestAnimationFrame(() => {
      const { trigger, role } = target;
      (trigger.isConnected && !trigger.disabled ? trigger : addButtons.current[role])?.focus();
    });
  }

  function closeAdd() {
    setEdit(undefined);
    restoreFocus();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!edit || !project || !canEdit || submitting.current) return;
    const employeeId = deleting?.employeeId ?? employee.trim();
    if (!/^[a-z][0-9]{8}$/.test(employeeId)) {
      setError(
        zh
          ? "请输入一个小写字母和八位数字组成的工号。"
          : "Enter one lowercase letter followed by eight digits.",
      );
      setRequestFailed(false);
      return;
    }
    submitting.current = true;
    setBusy(true);
    setError("");
    setRequestFailed(false);
    try {
      const result = await ai.command({
        type: edit.type,
        projectId: project.id,
        role: edit.role,
        employeeId,
      });
      if (result) {
        if (deleting) setEdit(undefined);
        else closeAdd();
      } else setRequestFailed(true);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <main className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable_both-edges]">
      <div className={`${AIREQ_PAGE_CONTENT_CLASSNAME} space-y-7`}>
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0 space-y-1.5">
            <h1 className={AIREQ_PAGE_TITLE_CLASSNAME}>{zh ? "角色管理" : "Role management"}</h1>
            {!administrator && (
              <p className="text-ui-sm text-foreground-subtle">
                {zh ? "名单由管理员维护。" : "Only administrators can edit the lists."}
              </p>
            )}
          </div>
          <div className="min-w-0 w-full max-w-xs space-y-1.5">
            <Label htmlFor="role-project">{zh ? "项目" : "Project"}</Label>
            <Select
              value={project?.id ?? ""}
              disabled={busy || !projects.length}
              onValueChange={(value) => {
                setChosenProject(value);
                setEdit(undefined);
                setError("");
                setRequestFailed(false);
                returnFocus.current = null;
              }}
            >
              <SelectTrigger id="role-project" className="w-full">
                <SelectValue placeholder={zh ? "选择项目" : "Choose a project"} />
              </SelectTrigger>
              <SelectContent>
                {projects.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </header>

        {project && (
          <div role="status" className="space-y-1 border-y border-border py-3">
            <p className="font-medium">
              {zh ? `我的项目角色：${roleSummary}` : `My project role: ${roleSummary}`}
            </p>
            <p className="text-ui-base text-foreground-subtle">
              {zh
                ? "所有人都可进入需求 Agent、发起需求评审和查阅文档。"
                : "Everyone can use the Requirements Agent, request requirements reviews, and view documents."}
            </p>
            <p className="text-ui-base text-foreground-subtle">
              {currentRoles.length
                ? zh
                  ? "你还可以进入方案 Agent、发起方案评审，并确认符合定版条件的最新版。"
                  : "You can also use the Solution Agent, request solution reviews, and confirm the latest eligible document version."
                : zh
                  ? "加入开发或测试名单后，可进入方案 Agent、发起方案评审，并确认符合定版条件的最新版。"
                  : "A developer or tester role lets you use the Solution Agent, request solution reviews, and confirm the latest eligible document version."}
            </p>
          </div>
        )}

        <div className="grid min-w-0 items-start gap-6 @min-[640px]/conversation:grid-cols-2">
          {roles.map((role) => {
            const title = roleTitle(role);
            const heading = `role-list-${role}`;
            const adding = edit?.type === "addProjectRoleMember" && edit.role === role;
            const members =
              ai.view?.projectRoleMembers
                .filter((member) => member.projectId === project?.id && member.role === role)
                .sort((a, b) => a.employeeId.localeCompare(b.employeeId)) ?? [];
            return (
              <section key={role} className="min-w-0 space-y-3" aria-labelledby={heading}>
                <div className="flex items-center justify-between gap-3">
                  <h2 id={heading} className="text-ui-lg font-semibold">
                    {title}
                  </h2>
                  <Button
                    ref={(button) => {
                      if (button) addButtons.current[role] = button;
                      else delete addButtons.current[role];
                    }}
                    variant="outline"
                    disabled={!canEdit || adding}
                    aria-label={
                      zh
                        ? `添加${role === "development" ? "开发" : "测试"}成员`
                        : `Add a member to ${title.toLowerCase()}`
                    }
                    onClick={(event) =>
                      startEdit({ type: "addProjectRoleMember", role }, event.currentTarget)
                    }
                  >
                    <Plus aria-hidden="true" className="size-4" />
                    {zh ? "添加" : "Add"}
                  </Button>
                </div>
                <div className="overflow-x-auto rounded-xl border border-card-border bg-card">
                  <table aria-labelledby={heading} className="w-full text-left text-ui-base">
                    <thead className="border-b border-border bg-card text-ui-sm text-foreground">
                      <tr>
                        <th scope="col" className="px-4 py-3 font-medium">
                          {zh ? "工号" : "Employee ID"}
                        </th>
                        <th scope="col" className="px-4 py-3 text-right font-medium">
                          {zh ? "操作" : "Actions"}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {adding && (
                        <tr>
                          <td colSpan={2} className="px-4 py-3">
                            <form onSubmit={(event) => void submit(event)} className="space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <Input
                                  autoFocus
                                  aria-label={zh ? "成员工号" : "Member employee ID"}
                                  aria-invalid={Boolean(errorMessage)}
                                  aria-describedby={errorMessage ? "role-member-error" : undefined}
                                  value={employee}
                                  onChange={(event) => {
                                    setEmployee(event.target.value);
                                    setError("");
                                    setRequestFailed(false);
                                  }}
                                  readOnly={busy}
                                  placeholder={zh ? "输入工号" : "Enter employee ID"}
                                  autoCapitalize="none"
                                  autoComplete="off"
                                  spellCheck={false}
                                  className="min-w-28 flex-1 font-mono"
                                />
                                <Button
                                  type="button"
                                  variant="ghost"
                                  disabled={busy}
                                  onClick={closeAdd}
                                >
                                  {zh ? "取消" : "Cancel"}
                                </Button>
                                <Button type="submit" disabled={!canEdit || !employee.trim()}>
                                  {busy
                                    ? zh
                                      ? "添加中…"
                                      : "Adding…"
                                    : zh
                                      ? "确认添加"
                                      : "Add member"}
                                </Button>
                              </div>
                              {errorMessage && (
                                <p
                                  id="role-member-error"
                                  role="alert"
                                  className="text-ui-sm text-destructive"
                                >
                                  {errorMessage}
                                </p>
                              )}
                            </form>
                          </td>
                        </tr>
                      )}
                      {members.map(({ employeeId }) => (
                        <tr key={employeeId} className="hover:bg-surface-hover">
                          <td className="px-4 py-3 text-foreground">
                            <span className="font-mono">{employeeId}</span>
                            {employeeId === currentEmployee && (
                              <span className="ml-2 text-ui-sm text-foreground-subtle">
                                {zh ? "本人" : "You"}
                              </span>
                            )}
                          </td>
                          <td className="px-2 py-2 text-right">
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={!canEdit}
                              aria-label={
                                zh
                                  ? `从${title}删除 ${employeeId}`
                                  : `Remove ${employeeId} from ${title.toLowerCase()}`
                              }
                              onClick={(event) =>
                                startEdit(
                                  { type: "removeProjectRoleMember", role, employeeId },
                                  event.currentTarget,
                                )
                              }
                            >
                              {zh ? "删除" : "Remove"}
                            </Button>
                          </td>
                        </tr>
                      ))}
                      {!members.length && !adding && (
                        <tr>
                          <td
                            colSpan={2}
                            className="px-4 py-7 text-center text-ui-sm text-foreground-subtle"
                          >
                            {project
                              ? zh
                                ? "暂无成员"
                                : "No members"
                              : ai.pending
                                ? zh
                                  ? "正在读取项目…"
                                  : "Loading projects…"
                                : zh
                                  ? "暂无项目"
                                  : "No projects"}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}
        </div>
      </div>

      <Dialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open && !submitting.current) setEdit(undefined);
        }}
      >
        {deleting && (
          <DialogContent
            className="sm:max-w-sm"
            showCloseButton={false}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              restoreFocus();
            }}
          >
            <form onSubmit={(event) => void submit(event)} className="space-y-4">
              <DialogHeader>
                <DialogTitle>{zh ? "删除角色成员" : "Remove role member"}</DialogTitle>
                <DialogDescription>
                  {zh
                    ? `从「${project?.name}」的${roleTitle(deleting.role)}删除 ${deleting.employeeId}？`
                    : `Remove ${deleting.employeeId} from the ${roleTitle(deleting.role).toLowerCase()} list in ${project?.name}?`}
                </DialogDescription>
              </DialogHeader>
              {errorMessage && (
                <p role="alert" className="text-ui-sm text-destructive">
                  {errorMessage}
                </p>
              )}
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => setEdit(undefined)}
                >
                  {zh ? "取消" : "Cancel"}
                </Button>
                <Button type="submit" variant="destructive" disabled={!canEdit}>
                  {busy ? (zh ? "删除中…" : "Removing…") : zh ? "确认删除" : "Remove member"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        )}
      </Dialog>
    </main>
  );
}
