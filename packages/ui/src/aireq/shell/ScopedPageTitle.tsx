import { FolderGit2, Tag } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.js";
import { useAIReq } from "../AIReqContext.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { AIREQ_PAGE_TITLE_CLASSNAME } from "./pageLayout.js";

export function ScopedPageTitle({
  title,
  count,
  withRelease = false,
}:
  | { title: string; count?: number; withRelease: true }
  | { title?: never; count?: never; withRelease?: false }) {
  const ai = useAIReq()!;
  const { locale } = useZCodeIntl();
  const zh = locale === "zh-CN";
  const project = ai.view?.projects.find((item) => item.id === ai.selection.projectId);
  const releases = ai.view?.releases.filter((item) => item.projectId === project?.id) ?? [];
  const release = releases.find((item) => item.id === ai.selection.releaseId);
  const trigger =
    "h-8 min-w-0 max-w-full gap-2 rounded-md border-border bg-card px-2.5 font-medium [&_[data-slot=select-value]]:truncate";
  const placeholder = zh ? "未选择项目" : "Choose project";
  const projectPicker = (
    <Select
      value={project?.id ?? ""}
      onValueChange={(id) => ai.navigate(() => ai.switchProject(id))}
      disabled={!ai.view?.projects.length}
    >
      <SelectTrigger
        aria-label={zh ? "项目" : "Project"}
        title={project?.name}
        variant={withRelease ? "input" : "ghost"}
        className={
          withRelease
            ? trigger
            : `h-auto max-w-full gap-2 border-0 p-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-input-border-focused [&_svg]:size-5 ${AIREQ_PAGE_TITLE_CLASSNAME}`
        }
      >
        {withRelease && (
          <FolderGit2 aria-hidden="true" className="size-3.5 shrink-0 text-foreground-subtle" />
        )}
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent position="popper" align="start">
        {ai.view?.projects.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            {p.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
  if (!withRelease) {
    return (
      <h1
        className={`min-w-0 max-w-full ${AIREQ_PAGE_TITLE_CLASSNAME}`}
        aria-label={project?.name ?? placeholder}
      >
        {projectPicker}
      </h1>
    );
  }
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
      <h1 className={AIREQ_PAGE_TITLE_CLASSNAME}>{title}</h1>
      <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
        {projectPicker}
        {project && (
          <Select
            value={release ? `release:${release.id}` : "all"}
            onValueChange={(value) =>
              ai.openProject(
                project.id,
                value === "all" ? undefined : value.slice("release:".length),
              )
            }
            disabled={!ai.selectionReady || !releases.length}
          >
            <SelectTrigger
              aria-label={zh ? "版本范围" : "Release scope"}
              title={release?.title}
              className={trigger}
            >
              <Tag aria-hidden="true" className="size-3.5 shrink-0 text-foreground-subtle" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" align="start">
              <SelectItem value="all">{zh ? "全部需求" : "All requirements"}</SelectItem>
              {releases.map((r) => (
                <SelectItem key={r.id} value={`release:${r.id}`}>
                  {r.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {count !== undefined && (
          <span className="whitespace-nowrap text-ui-caption text-foreground-subtle tabular-nums">
            {zh ? `${count} 条 IR` : `${count} IRs`}
          </span>
        )}
      </div>
    </div>
  );
}
