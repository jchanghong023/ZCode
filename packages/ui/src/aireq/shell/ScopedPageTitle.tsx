import { useAIReq } from "../AIReqContext.js";
import { AIREQ_PAGE_TITLE_CLASSNAME } from "./pageLayout.js";

export function ScopedPageTitle({ title }: { title: string }) {
  const ai = useAIReq()!;
  const project = ai.view?.projects.find((item) => item.id === ai.selection.projectId);
  const release = ai.view?.releases.find(
    (item) => item.projectId === project?.id && item.id === ai.releaseId,
  );
  const scope = ai.selectionReady && project && release && `${project.name} · ${release.title}`;
  return (
    <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1 @max-[520px]/conversation:flex-col @max-[520px]/conversation:items-start">
      <h1 className={AIREQ_PAGE_TITLE_CLASSNAME}>{title}</h1>
      {scope && (
        <p className="min-w-0 max-w-full truncate text-ui-sm text-foreground-subtle" title={scope}>
          {scope}
        </p>
      )}
    </div>
  );
}
