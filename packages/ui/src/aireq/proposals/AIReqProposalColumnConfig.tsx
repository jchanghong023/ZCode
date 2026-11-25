import { useState } from "react";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDown, ArrowUp, Columns3, GripVertical, X } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { Checkbox } from "@/components/ui/checkbox.js";
import { Input } from "@/components/ui/input.js";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog.js";
import {
  compactColumns,
  detailedColumns,
  proposalColumns,
  proposalFieldGroups,
  type ProposalColumn,
} from "./proposalColumns.js";

const fieldGroups = Object.entries(proposalFieldGroups).map(([group, labels]) => ({
  ...labels,
  fields: detailedColumns.filter((column) => proposalColumns[column].group === group),
}));
const personnelColumns = detailedColumns.filter(
  (column) => proposalColumns[column].group === "people",
);
const presets = [
  { zh: "精简", en: "Compact", columns: compactColumns, autoFit: true },
  {
    zh: "责任分工",
    en: "Personnel",
    columns: ["title", "id", ...personnelColumns] as ProposalColumn[],
    autoFit: false,
  },
  { zh: "全部字段", en: "All fields", columns: detailedColumns, autoFit: false },
];

export function AIReqProposalColumnConfig({
  columns,
  autoFit,
  disabled,
  saving,
  error,
  zh,
  onChange,
  onReset,
  onRetry,
}: {
  columns: ProposalColumn[];
  autoFit: boolean;
  disabled: boolean;
  saving: boolean;
  error?: string;
  zh: boolean;
  onChange: (columns: ProposalColumn[], autoFit?: boolean) => void;
  onReset: () => void;
  onRetry: () => void;
}) {
  const label = zh ? "列配置" : "Columns";
  const [query, setQuery] = useState("");
  const search = query.trim().toLocaleLowerCase();
  const groups = fieldGroups
    .map((group) => ({
      ...group,
      fields: group.fields.filter((column) => {
        const { zh, en } = proposalColumns[column];
        return (
          zh.includes(search) ||
          en.toLocaleLowerCase().includes(search) ||
          column.toLowerCase().includes(search)
        );
      }),
    }))
    .filter(({ fields }) => fields.length > 0);
  const isPreset = (preset: ProposalColumn[]) =>
    preset.length === columns.length && preset.every((column, index) => column === columns[index]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const name = (column: ProposalColumn) => proposalColumns[column][zh ? "zh" : "en"];
  const remove = (column: ProposalColumn) => onChange(columns.filter((item) => item !== column));
  const move = (from: number, to: number) => onChange(arrayMove(columns, from, to));
  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = columns.findIndex((column) => column === active.id);
    const to = columns.findIndex((column) => column === over.id);
    if (from >= 0 && to >= 0) move(from, to);
  };

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) setQuery("");
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="lg" disabled={disabled}>
          <Columns3 aria-hidden="true" />
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent
        aria-describedby={undefined}
        className="flex max-h-[85dvh] max-w-[min(44rem,calc(100%-2rem))] flex-col overflow-hidden p-0"
      >
        <DialogHeader className="shrink-0 border-b border-border px-5 pt-4 pb-3 pr-16">
          <DialogTitle className="text-ui-lg font-semibold">{label}</DialogTitle>
        </DialogHeader>
        <div className="grid min-h-0 grid-cols-1 gap-4 overflow-y-auto px-5 sm:grid-cols-2 sm:overflow-hidden">
          <section className="flex min-h-0 min-w-0 flex-col gap-3">
            <h3 className="shrink-0 font-semibold">{zh ? "可选字段" : "Available fields"}</h3>
            <div className="flex shrink-0 flex-wrap items-center gap-1">
              {presets.map((preset) => (
                <Button
                  key={preset.en}
                  type="button"
                  size="lg"
                  variant="outline"
                  aria-pressed={autoFit === preset.autoFit && isPreset(preset.columns)}
                  className="aria-pressed:bg-selected aria-pressed:font-semibold"
                  onClick={() => onChange(preset.columns, preset.autoFit)}
                >
                  {zh ? preset.zh : preset.en}
                </Button>
              ))}
            </div>
            {autoFit && (
              <p className="shrink-0 text-ui-caption text-foreground-subtle">
                {zh
                  ? "空间足够时显示进展、停留时间、工作量及开发、测试责任人。"
                  : "Status, time in status, workload, and owners appear when space allows."}
              </p>
            )}
            <Input
              type="search"
              aria-label={zh ? "搜索字段" : "Search fields"}
              placeholder={zh ? "搜索字段" : "Search fields"}
              className="shrink-0"
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
            />
            <div className="space-y-3 sm:min-h-0 sm:overflow-y-auto sm:pr-2">
              {groups.length ? (
                groups.map((group) => (
                  <fieldset key={group.en}>
                    <legend className="text-ui-caption font-medium text-foreground-subtle">
                      {zh ? group.zh : group.en}
                    </legend>
                    <div className="grid grid-cols-2 gap-x-2">
                      {group.fields.map((column) => {
                        const visible = columns.includes(column);
                        return (
                          <label
                            key={column}
                            className="flex min-w-0 items-center gap-2 rounded-sm px-1 py-1.5"
                          >
                            <Checkbox
                              checked={visible}
                              disabled={visible && columns.length === 1}
                              onCheckedChange={(checked) => {
                                if (checked) onChange([...columns, column]);
                                else remove(column);
                              }}
                            />
                            <span className="wrap-anywhere">{name(column)}</span>
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
                ))
              ) : (
                <p role="status" className="text-ui-caption text-foreground-subtle">
                  {zh ? "没有匹配的字段。" : "No matching fields."}
                </p>
              )}
            </div>
          </section>
          <section className="flex min-h-0 min-w-0 flex-col gap-2 sm:border-l sm:border-border sm:pl-4">
            <h3 className="font-semibold">
              {zh ? "已选字段" : "Selected fields"}{" "}
              <span className="text-ui-caption tabular-nums text-foreground-subtle">
                {columns.length}
              </span>
            </h3>
            <p className="text-ui-caption text-foreground-subtle">
              {zh ? "拖动手柄调整显示顺序" : "Drag handles to change the order"}
            </p>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
              accessibility={{
                screenReaderInstructions: {
                  draggable: zh
                    ? "按空格拾起，按方向键移动，再按空格放下。"
                    : "Press Space to pick up, arrow keys to move, and Space to drop.",
                },
              }}
            >
              <SortableContext items={columns} strategy={verticalListSortingStrategy}>
                <ol
                  aria-label={zh ? "已选字段顺序" : "Selected field order"}
                  className="divide-y divide-border/60 sm:min-h-0 sm:overflow-y-auto sm:pr-2"
                >
                  {columns.map((column, index) => (
                    <SelectedColumn
                      key={column}
                      column={column}
                      name={name(column)}
                      zh={zh}
                      first={index === 0}
                      last={index === columns.length - 1}
                      onMove={(step) => move(index, index + step)}
                      onRemove={() => remove(column)}
                    />
                  ))}
                </ol>
              </SortableContext>
            </DndContext>
          </section>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-border px-5 py-2">
          {error ? (
            <>
              <p role="alert" className="text-ui-caption text-destructive">
                {error}
              </p>
              <Button type="button" variant="outline" onClick={onRetry}>
                {zh ? "重试" : "Retry"}
              </Button>
            </>
          ) : (
            saving && (
              <p role="status" className="text-ui-caption text-foreground-subtle">
                {zh ? "正在保存列配置…" : "Saving column settings…"}
              </p>
            )
          )}
          <Button type="button" variant="ghost" size="lg" className="ml-auto" onClick={onReset}>
            {zh ? "恢复默认" : "Reset to default"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SelectedColumn({
  column,
  name,
  first,
  last,
  zh,
  onMove,
  onRemove,
}: {
  column: ProposalColumn;
  name: string;
  first: boolean;
  last: boolean;
  zh: boolean;
  onMove: (step: -1 | 1) => void;
  onRemove: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: column, disabled: first && last });
  const dragLabel = zh ? `拖动 ${name}` : `Drag ${name}`;
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`relative flex min-h-9 items-center gap-1 rounded-sm py-0.5 ${isDragging ? "z-10 bg-selected" : ""}`}
    >
      <Button
        {...attributes}
        {...listeners}
        ref={setActivatorNodeRef}
        type="button"
        disabled={first && last}
        size="icon"
        variant="ghost"
        aria-label={dragLabel}
        title={dragLabel}
        className="touch-none cursor-grab text-foreground-subtle active:cursor-grabbing"
      >
        <GripVertical aria-hidden="true" />
      </Button>
      <span className="min-w-0 flex-1 wrap-anywhere">{name}</span>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        disabled={first}
        aria-label={zh ? `上移 ${name}` : `Move ${name} up`}
        onClick={() => onMove(-1)}
      >
        <ArrowUp aria-hidden="true" />
      </Button>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        disabled={last}
        aria-label={zh ? `下移 ${name}` : `Move ${name} down`}
        onClick={() => onMove(1)}
      >
        <ArrowDown aria-hidden="true" />
      </Button>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        disabled={first && last}
        aria-label={zh ? `隐藏 ${name}` : `Hide ${name}`}
        onClick={onRemove}
      >
        <X aria-hidden="true" />
      </Button>
    </li>
  );
}
