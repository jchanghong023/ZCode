import { useAIReq } from "../AIReqContext.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { AIREQ_PAGE_TITLE_CLASSNAME } from "./pageLayout.js";

export function ScopedPageTitle({ title }: { title: string }) {
  const ai = useAIReq()!;
  const { locale } = useZCodeIntl();
  const project = ai.view?.projects.find((item) => item.id === ai.selection.projectId);
  const release = ai.view?.releases.find(
    (item) => item.projectId === project?.id && item.id === ai.selection.releaseId,
  );
  const scope = ai.selectionReady &&
    project && {
      project: project.name,
      version: release?.title ?? (locale === "zh-CN" ? "全部需求" : "All requirements"),
    };
  return (
    <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1 @max-[520px]/conversation:flex-col @max-[520px]/conversation:items-start">
      <h1 className={AIREQ_PAGE_TITLE_CLASSNAME}>{title}</h1>
      {scope && (
        <p
          className="min-w-0 max-w-full truncate text-ui-base text-foreground-subtle"
          title={`${scope.project} / ${scope.version}`}
        >
          {scope.project} <span aria-hidden="true">/</span> {scope.version}
        </p>
      )}
    </div>
  );
}
