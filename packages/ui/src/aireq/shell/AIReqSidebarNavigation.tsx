import { useState, type FormEvent } from "react";
import {
  Folders,
  FolderGit2,
  Tag,
  Inbox,
  Lightbulb,
  FileText,
  MessagesSquare,
  LayoutDashboard,
  UserRoundPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button.js";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.js";
import aireqMarkUrl from "@/assets/aireq-mark.png";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { useAIReq } from "../AIReqContext.js";
import { Checkbox } from "@/components/ui/checkbox.js";
import { Label } from "@/components/ui/label.js";
import { Textarea } from "@/components/ui/textarea.js";
import { getEmployeeId } from "../identity.js";
import { hasProjectRole, type AIReqMainView, type AIReqProjectRole } from "../contract.js";
import { AIREQ_PAGE_CONTENT_CLASSNAME, AIREQ_PAGE_TITLE_CLASSNAME } from "./pageLayout.js";

type SidebarPage = {
  view: AIReqMainView;
  label: string;
  labelEn: string;
  icon: typeof Folders;
};

const globalPages = [
  { view: "projectProgress", label: "所有项目", labelEn: "All projects", icon: Folders },
  { view: "ideas", label: "想法池", labelEn: "Ideas", icon: Lightbulb },
] satisfies SidebarPage[];

const workspacePages = [
  {
    view: "projectOverview",
    label: "项目概览",
    labelEn: "Project overview",
    icon: LayoutDashboard,
  },
  { view: "proposals", label: "需求共创", labelEn: "Co-creation", icon: MessagesSquare },
  { view: "formal", label: "正式文档", labelEn: "Formal documents", icon: FileText },
  { view: "todos", label: "版本待办", labelEn: "Release todos", icon: Inbox },
] satisfies SidebarPage[];

const roleLabel = { development: "开发", testing: "测试" } as const;
const statusLabel = {
  pending: "待审批",
  approved: "已授权",
  rejected: "未通过",
  revoked: "已撤销",
};

export function AIReqSidebarNavigation() {
  const ai = useAIReq()!;
  const { locale } = useZCodeIntl();
  const zh = locale === "zh-CN";
  const project = ai.view?.projects.find((item) => item.id === ai.selection.projectId);
  const releases =
    ai.view?.availableReleases.filter((item) => item.projectId === project?.id) ?? [];
  const formal = Boolean(
    ai.selection.formalView ||
    ai.view?.groups.some(
      (item) => item.projectId === ai.selection.projectId && item.id === ai.selection.irId,
    ),
  );
  const selected = ai.mainView === "chat" ? (formal ? "formal" : "proposals") : ai.mainView;
  const inWorkspace = globalPages.every((page) => page.view !== selected);
  const renderPage = ({ view, label, labelEn, icon: Icon }: SidebarPage) => (
    <Button
      key={view}
      variant="ghost"
      size="lg"
      // 全局焦点样式会清除 outline 和阴影；复用按钮已有边框标出键盘焦点，行宽不变。
      className="h-auto min-h-9 w-full justify-start gap-3 py-2 [@media(max-height:740px)]:min-h-8 [@media(max-height:740px)]:py-1 focus-visible:border-remote-foreground-muted aria-[current=page]:bg-selected aria-[current=page]:font-semibold aria-[current=page]:hover:bg-selected"
      aria-current={selected === view ? "page" : undefined}
      data-aireq-motion-nav=""
      onClick={() => ai.navigate(() => ai.setMainView(view, { fromSidebar: true }))}
    >
      <Icon
        className={`size-4 ${selected === view ? "text-foreground" : "text-remote-foreground-muted"}`}
        aria-hidden="true"
      />
      <span data-aireq-motion-label="" className="min-w-0 flex-1 truncate text-left">
        {zh ? label : labelEn}
      </span>
    </Button>
  );
  return (
    <>
      <div className="flex h-16 shrink-0 items-center gap-2 px-4">
        <img
          src={aireqMarkUrl}
          alt=""
          aria-hidden="true"
          draggable={false}
          className="size-8 shrink-0 select-none object-contain"
        />
        <div className="flex min-w-0 flex-col gap-0.5">
          <span lang="zh-CN" className="text-ui-lg leading-tight font-semibold text-foreground">
            AI 需求协作
          </span>
          <span lang="en" className="text-ui-sm leading-none text-remote-foreground-muted">
            AI Requirements
          </span>
        </div>
      </div>
      <nav
        aria-label={zh ? "全局导航" : "Global navigation"}
        className="flex shrink-0 flex-col gap-1 px-3 pb-3"
      >
        {globalPages.map(renderPage)}
      </nav>
      {inWorkspace && (
        <section
          aria-label={zh ? "版本工作区" : "Release workspace"}
          className="mx-3 flex min-h-0 flex-1 flex-col border-t border-border pt-2"
        >
          {/* 范围区固定在滚动区外：页面分组滚动时项目与 Release 始终可见，切范围不必先找回选择器。 */}
          <div className="shrink-0 pb-2">
            <section
              aria-label={zh ? "当前工作范围" : "Current workspace"}
              className="space-y-0.5 rounded-xl border border-border/70 p-1"
            >
              <Select
                value={project?.id ?? ""}
                onValueChange={(id) => ai.navigate(() => ai.switchProject(id))}
                disabled={!ai.view?.projects.length}
              >
                <SelectTrigger
                  variant="ghost"
                  className="h-auto min-h-12 w-full min-w-0 justify-start gap-3 rounded-lg px-2.5 py-2 text-left focus-visible:border-remote-foreground-muted data-[state=open]:bg-selected"
                  aria-labelledby="sidebar-project-label"
                  title={project?.name}
                >
                  <FolderGit2 className="size-4 text-foreground-subtle" aria-hidden="true" />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span
                      id="sidebar-project-label"
                      className="text-ui-sm leading-4 text-remote-foreground-muted"
                    >
                      {zh ? "项目" : "Project"}
                    </span>
                    <SelectValue
                      className="block truncate text-ui-base leading-5 font-semibold text-foreground"
                      placeholder={zh ? "未选择项目" : "Choose project"}
                    />
                  </span>
                </SelectTrigger>
                <SelectContent
                  position="popper"
                  align="start"
                  sideOffset={6}
                  className="w-(--radix-select-trigger-width) [&_[data-position=popper]]:min-w-0"
                >
                  {ai.view?.projects.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="mx-2.5 border-t border-border/50" aria-hidden="true" />
              <Select
                value={releases.some((item) => item.id === ai.releaseId) ? ai.releaseId : ""}
                onValueChange={(id) => ai.navigate(() => ai.setReleaseId(id))}
                disabled={!ai.selectionReady || !releases.length}
              >
                <SelectTrigger
                  variant="ghost"
                  className="h-auto min-h-12 w-full min-w-0 justify-start gap-3 rounded-lg px-2.5 py-2 text-left focus-visible:border-remote-foreground-muted data-[state=open]:bg-selected"
                  aria-labelledby="sidebar-release-label"
                  title={releases.find((item) => item.id === ai.releaseId)?.title}
                >
                  <Tag className="size-4 text-foreground-subtle" aria-hidden="true" />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span
                      id="sidebar-release-label"
                      className="text-ui-sm leading-4 text-remote-foreground-muted"
                    >
                      Release
                    </span>
                    <SelectValue
                      className="block truncate text-ui-base leading-5 font-medium text-foreground"
                      placeholder={
                        !ai.selectionReady
                          ? zh
                            ? "正在读取…"
                            : "Loading…"
                          : zh
                            ? "暂无 Release"
                            : "No releases"
                      }
                    />
                  </span>
                </SelectTrigger>
                <SelectContent
                  position="popper"
                  align="start"
                  sideOffset={6}
                  className="w-(--radix-select-trigger-width) [&_[data-position=popper]]:min-w-0"
                >
                  {releases.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </section>
          </div>
          <nav
            aria-label={zh ? "版本导航" : "Release navigation"}
            className="min-h-0 space-y-1 overflow-y-auto pb-3 [@media(max-height:740px)]:space-y-0.5"
          >
            {workspacePages.map(renderPage)}
          </nav>
        </section>
      )}
      {!inWorkspace && <div className="flex-1" />}
      <div className="shrink-0 px-3 pb-2">
        {renderPage({
          view: "roles",
          label: "角色申请",
          labelEn: "Role access",
          icon: UserRoundPlus,
        })}
      </div>
    </>
  );
}

export function AIReqRolesPage() {
  const ai = useAIReq()!;
  const [chosenProject, setChosenProject] = useState<string>();
  const [roles, setRoles] = useState<AIReqProjectRole[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const employee = getEmployeeId();
  const projects = ai.view?.projects ?? [];
  const projectId = chosenProject ?? ai.selection.projectId ?? projects[0]?.id ?? "";
  const project = projects.find((item) => item.id === projectId);
  const records = ai.view?.roleRegistrations ?? [];
  const mine = records.filter((entry) => entry.employeeId === employee);
  const projectRecords = records.filter((entry) => entry.projectId === projectId);
  const roleStatus = (role: AIReqProjectRole) => {
    if (hasProjectRole(ai.view, project?.id, employee, role)) return "approved";
    return mine.find(
      (entry) => entry.projectId === projectId && entry.role === role && entry.status === "pending",
    )?.status;
  };
  const selectedRoles = roles.filter((role) => !roleStatus(role));
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!project || !selectedRoles.length || busy) return;
    setBusy(true);
    setFeedback("");
    try {
      if (
        await ai.command({ type: "requestProjectRoles", projectId, roles: selectedRoles, note })
      ) {
        setRoles([]);
        setNote("");
        setFeedback("角色申请已提交，等待管理员审批。");
      }
    } finally {
      setBusy(false);
    }
  };
  const decide = async (registrationId: string, decision: "approved" | "rejected" | "revoked") => {
    if (busy) return;
    setBusy(true);
    setFeedback("");
    try {
      if (await ai.command({ type: "decideProjectRole", projectId, registrationId, decision }))
        setFeedback("角色记录已更新。");
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable_both-edges]">
      <div className={AIREQ_PAGE_CONTENT_CLASSNAME + " space-y-7"}>
        <header className="space-y-1">
          <h1 className={AIREQ_PAGE_TITLE_CLASSNAME}>角色申请</h1>
          <p className="text-ui-sm text-foreground-subtle">
            工号 {employee} ·{" "}
            {ai.view?.roleAdministrator
              ? "管理员默认拥有业务、开发和测试权限。"
              : "默认拥有业务权限。开发与测试权限按项目审批。"}
          </p>
        </header>
        <form onSubmit={(event) => void submit(event)} className="max-w-lg space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="role-project">项目</Label>
            <Select
              value={project?.id ?? ""}
              disabled={busy || !projects.length}
              onValueChange={(value) => {
                setChosenProject(value);
                setRoles([]);
                setFeedback("");
              }}
            >
              <SelectTrigger id="role-project" className="w-full">
                <SelectValue placeholder={ai.pending ? "正在读取项目…" : "选择项目"} />
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
          <fieldset>
            <legend className="mb-2 font-medium">申请角色（可多选）</legend>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {(["development", "testing"] as const).map((role) => {
                const status = roleStatus(role);
                return (
                  <Label key={role} className="min-h-8 gap-2">
                    <Checkbox
                      checked={selectedRoles.includes(role)}
                      disabled={busy || !project || Boolean(status)}
                      onCheckedChange={(checked) =>
                        setRoles((current) =>
                          checked === true
                            ? [...current, role]
                            : current.filter((item) => item !== role),
                        )
                      }
                    />
                    {roleLabel[role]}
                    {status && (
                      <span className="text-ui-sm text-foreground-subtle">
                        {statusLabel[status]}
                      </span>
                    )}
                  </Label>
                );
              })}
            </div>
          </fieldset>
          <div className="space-y-1.5">
            <Label htmlFor="role-note">申请说明（选填）</Label>
            <Textarea
              id="role-note"
              value={note}
              maxLength={300}
              disabled={busy}
              rows={2}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
          <Button
            type="submit"
            disabled={busy || !ai.selectionReady || !project || !selectedRoles.length}
          >
            提交申请
          </Button>
          <p role="status" className="text-ui-sm text-foreground-subtle">
            {feedback}
          </p>
        </form>
        <section className="space-y-2">
          <h2 className="text-ui-lg font-medium">我的申请</h2>
          {mine.length ? (
            <ul className="divide-y divide-border rounded-lg border border-card-border bg-card px-4">
              {mine.map((entry) => (
                <li key={entry.id} className="flex flex-wrap justify-between gap-2 py-3">
                  <span>
                    {projects.find((item) => item.id === entry.projectId)?.name ?? entry.projectId}{" "}
                    · {roleLabel[entry.role]}
                  </span>
                  <span className="text-ui-sm text-foreground-subtle">
                    {statusLabel[entry.status]}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-ui-sm text-foreground-subtle">暂无角色申请。</p>
          )}
        </section>
        {ai.view?.roleAdministrator && (
          <section className="space-y-2">
            <h2 className="text-ui-lg font-medium">角色管理</h2>
            <p className="text-ui-sm text-foreground-subtle">
              当前项目 · {project?.name ?? "请选择项目"}
            </p>
            {projectRecords.length ? (
              <ul className="divide-y divide-border rounded-lg border border-card-border bg-card px-4">
                {projectRecords.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                  >
                    <div className="min-w-0 space-y-1">
                      <p className="font-medium">
                        {entry.employeeId} · {roleLabel[entry.role]} · {statusLabel[entry.status]}
                      </p>
                      {entry.note && (
                        <p className="wrap-anywhere text-ui-sm text-foreground-subtle">
                          {entry.note}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {entry.status === "pending" && (
                        <>
                          <Button
                            size="sm"
                            disabled={busy}
                            onClick={() => void decide(entry.id, "approved")}
                            aria-label={entry.employeeId + " 批准" + roleLabel[entry.role]}
                          >
                            批准
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => void decide(entry.id, "rejected")}
                            aria-label={entry.employeeId + " 拒绝" + roleLabel[entry.role]}
                          >
                            拒绝
                          </Button>
                        </>
                      )}
                      {entry.status === "approved" && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => void decide(entry.id, "revoked")}
                          aria-label={entry.employeeId + " 撤销" + roleLabel[entry.role]}
                        >
                          撤销授权
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-ui-sm text-foreground-subtle">当前项目暂无角色记录。</p>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
