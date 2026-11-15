import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { MarkerType, Panel, Position } from "@xyflow/react";
import type { Edge, Node } from "@xyflow/react";
import { Canvas } from "@/components/ai-elements/canvas.js";
import { Controls } from "@/components/ai-elements/controls.js";
import { readSrDependencies } from "../contract.js";
import type {
  AIReqMaterialView,
  AIReqRequirementGroup,
  AIReqSystemRequirement,
} from "../contract.js";

type DependencyEdge = Edge<{ reason: string }>;

export function AIReqSrDependencyGraph({
  group,
  material,
  rows,
}: {
  group: AIReqRequirementGroup;
  material: AIReqMaterialView;
  rows: AIReqSystemRequirement[];
}) {
  const scope = JSON.stringify([group.projectId, group.id, material.path, material.sha256]);
  // 边 ID 会跨材料版本复用；切换时重置唯一选择 owner，返回旧版本也不能恢复旧原因。
  const [selection, setSelection] = useState<{ scope: string; id?: string }>({ scope });
  if (selection.scope !== scope) setSelection({ scope });
  const selectedId = selection.scope === scope ? selection.id : undefined;
  const graph = useMemo(() => {
    const result = readSrDependencies(group, material, false);
    const nodes: Node<{ label: ReactNode }>[] = [];
    const edges: DependencyEdge[] = [];
    if (!result.document) return { nodes, edges, issue: result.issue };
    const entries = new Map(result.document.srs.map((row) => [row.srId, row]));
    const levels = new Map<string, number>();
    const level = (id: string): number => {
      const saved = levels.get(id);
      if (saved !== undefined) return saved;
      const depth = Math.max(
        0,
        ...entries.get(id)!.prerequisites.map((item) => level(item.srId) + 1),
      );
      levels.set(id, depth);
      return depth;
    };
    const widths = new Map<number, number>();
    for (const row of result.document.srs) {
      const depth = level(row.srId);
      widths.set(depth, (widths.get(depth) ?? 0) + 1);
    }
    const columns = new Map<number, number>();
    const maxWidth = Math.max(1, ...widths.values());
    for (const row of result.document.srs) {
      const depth = levels.get(row.srId)!;
      const column = columns.get(depth) ?? 0;
      columns.set(depth, column + 1);
      const title = rows.find((sr) => sr.id === row.srId)?.title ?? row.srId;
      const estimate = row.estimate;
      const estimateLabel =
        estimate &&
        Number.isFinite(estimate.workingDays) &&
        estimate.workingDays > 0 &&
        typeof estimate.assumptions === "string" &&
        estimate.assumptions.trim()
          ? `预估 ${estimate.workingDays} 个工作日`
          : "待预估";
      nodes.push({
        id: row.srId,
        position: { x: (column + (maxWidth - widths.get(depth)!) / 2) * 250, y: depth * 180 },
        sourcePosition: Position.Bottom,
        targetPosition: Position.Top,
        ariaLabel: `${row.srId}：${title}`,
        style: {
          width: 220,
          minHeight: 110,
          background: "var(--color-card)",
          color: "var(--color-foreground)",
          borderColor: "var(--color-border)",
          borderRadius: 8,
        },
        data: {
          label: (
            <div className="space-y-2 text-left">
              <p className="break-all font-mono text-ui-xs text-foreground-subtle">{row.srId}</p>
              <p className="break-words text-ui-sm font-medium">{title}</p>
              <p className="text-ui-xs text-foreground-subtle">{estimateLabel}</p>
            </div>
          ),
        },
      });
      for (const dependency of row.prerequisites)
        edges.push({
          id: JSON.stringify([dependency.srId, row.srId]),
          source: dependency.srId,
          target: row.srId,
          type: "smoothstep",
          data: { reason: dependency.reason },
          ariaLabel: `${dependency.srId} → ${row.srId}：${dependency.reason}`,
          markerEnd: { type: MarkerType.ArrowClosed, color: "var(--color-foreground-subtle)" },
          style: { stroke: "var(--color-foreground-subtle)", strokeWidth: 2 },
          interactionWidth: 24,
        });
    }
    return { nodes, edges };
  }, [group, material, rows]);
  const selected = graph.edges.find((edge) => edge.id === selectedId);
  const edges = useMemo(
    () => graph.edges.map((edge) => ({ ...edge, selected: edge.id === selectedId })),
    [graph.edges, selectedId],
  );
  if (graph.issue)
    return (
      <p role="alert" className="text-ui-sm text-destructive">
        {graph.issue}
      </p>
    );
  if (!graph.nodes.length)
    return <p className="text-ui-sm text-foreground-subtle">当前 IR 没有 SR。</p>;
  return (
    <section className="space-y-3" aria-label="SR 依赖图" data-testid="sr-dependency-graph">
      <p className="text-ui-xs text-foreground-subtle">
        箭头从前置 SR 指向依赖它的
        SR。可拖动平移、用按钮缩放；点击连线或聚焦后按 Enter／空格查看原因；缺少完整工期预估的节点标为“待预估”，请在方案对话中补齐。
        {!graph.edges.length && "各 SR 无前置依赖，可独立安排。"}
      </p>
      <div className="h-[420px] min-w-0 overflow-hidden rounded-md border border-border">
        {/* 任意选择器中的双下划线须转义；再用重要 token 覆盖 React Flow 未分层样式，保证深色对比度。 */}
        <Canvas
          key={scope}
          className="[&_.react-flow\_\_attribution]:bg-background! [&_.react-flow\_\_attribution_a]:text-foreground-subtle!"
          nodes={graph.nodes}
          edges={edges}
          nodesDraggable={false}
          nodesConnectable={false}
          edgesReconnectable={false}
          deleteKeyCode={null}
          selectionOnDrag={false}
          panOnDrag
          // 共享画布默认截获滚轮平移；此处交还材料面板，保留拖动和按钮缩放。
          panOnScroll={false}
          zoomOnScroll={false}
          preventScrolling={false}
          edgesFocusable
          multiSelectionKeyCode={null}
          minZoom={0.1}
          maxZoom={2}
          fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
          ariaLabelConfig={{
            "controls.ariaLabel": "依赖图视图控制",
            "controls.zoomIn.ariaLabel": "放大",
            "controls.zoomOut.ariaLabel": "缩小",
            "controls.fitView.ariaLabel": "适应视图",
            "edge.a11yDescription.default": "按 Enter 或空格查看依赖原因，按 Escape 清除选择。",
          }}
          // 键盘选边不会触发 onEdgeClick；统一接收受支持的选择变更，由本组件唯一持有选择。
          onEdgesChange={(changes) => {
            const selectedChange = changes.find(
              (change) => change.type === "select" && change.selected,
            );
            if (selectedChange?.type === "select") {
              setSelection({ scope, id: selectedChange.id });
            } else if (
              changes.some(
                (change) =>
                  change.type === "select" && !change.selected && change.id === selectedId,
              )
            ) {
              setSelection({ scope });
            }
          }}
          onPaneClick={() => setSelection({ scope })}
        >
          <Controls showInteractive={false} />
          {/* 图下原因在矮视口被裁到屏外；浮层放画布顶部，长正文仅在局部滚动。 */}
          {selected && (
            <Panel
              position="top-right"
              role="status"
              aria-label="依赖原因"
              className="nowheel nopan m-3! max-h-[45%] w-80 max-w-[calc(100%-1.5rem)] space-y-1 overflow-y-auto overscroll-contain rounded-md border border-border bg-card p-3 text-ui-sm shadow-sm"
            >
              <p className="break-all font-mono text-ui-xs text-foreground-subtle">
                {selected.source} → {selected.target}
              </p>
              <p className="break-words">{selected.data?.reason}</p>
            </Panel>
          )}
        </Canvas>
      </div>
    </section>
  );
}
