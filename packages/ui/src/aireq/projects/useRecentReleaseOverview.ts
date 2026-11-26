import { useEffect, useMemo, useState } from "react";
import { useAIReq } from "../AIReqContext.js";
import { recentReleases } from "./recentReleases.js";

/** 顶栏和总览按钮共用当前预览；点版本只更新预览，进入共创才提交导航。 */
export function useRecentReleaseOverview() {
  const { mainView, selection, selectionReady, view } = useAIReq()!;
  const projectId = selection.projectId;
  const active = mainView === "projectProgress";
  const [choice, selectRelease] = useState<{ projectId: string; releaseId: string }>();
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, [active]);
  const recent = useMemo(
    () =>
      active &&
      selectionReady &&
      view &&
      projectId &&
      !view.releaseReadFailures?.includes(projectId)
        ? recentReleases(view.releases, view.requirements, projectId, now)
        : [],
    [active, selectionReady, view, projectId, now],
  );
  const release =
    recent.find((r) => r.projectId === choice?.projectId && r.id === choice.releaseId) ?? recent[0];
  return { recent, release, selectRelease, now };
}
