import type { AIReqSystemRequirement } from "@zcode/services/aireq";
import type { InternalSystemRequirement } from "./internal-scenarios.js";
import { group, systemRequirement } from "./fixture-builders.js";

interface SrSample {
  id: string;
  title: string;
  percent?: number;
  certain?: boolean;
  merged?: boolean;
  accepted?: boolean;
  statusChange?: AIReqSystemRequirement["statusChange"];
}

/** 固定的历史业务样例；时间不随启动、读取或后台轮询更新。 */
const requirements: Array<{
  id: string;
  title: string;
  originalText?: string;
  srs: SrSample[];
}> = [
  {
    id: "ir-team-members",
    title: "团队成员管理",
    originalText:
      "管理员可邀请成员加入团队，查看成员和邀请状态，调整业务角色；重复邀请不得产生重复成员，权限变更后应明确说明生效范围。",
    srs: [
      {
        id: "sr-member-invitation",
        title: "成员邀请与重复邀请校验",
        percent: 45,
        statusChange: { from: "待开发", to: "开发中", at: "2026-11-17T01:00:00.000Z" },
      },
      {
        id: "sr-member-directory",
        title: "成员列表与角色筛选",
        percent: 99,
        certain: true,
        statusChange: { from: "开发中", to: "待合入", at: "2026-11-17T03:00:00.000Z" },
      },
      { id: "sr-member-role-change", title: "成员角色变更与生效提示" },
    ],
  },
  {
    id: "ir-message-preferences",
    title: "消息偏好设置",
    originalText:
      "成员可按消息类型设置提醒开关及免打扰时段，预览有效配置；保存失败时保留输入，停用提醒不应丢失站内消息。",
    srs: [
      {
        id: "sr-message-subscriptions",
        title: "消息类型订阅与配置保存",
        percent: 0,
        statusChange: { from: "开发中", to: "待开发", at: "2026-11-16T09:00:00.000Z" },
      },
      { id: "sr-quiet-hours", title: "免打扰时段与跨日校验", percent: 60 },
      {
        id: "sr-preference-preview",
        title: "提醒配置预览与恢复默认",
        percent: 99,
        certain: true,
        merged: true,
      },
    ],
  },
  {
    id: "ir-attachment-management",
    title: "附件管理",
    originalText:
      "业务对象可上传、查看和下载附件，显示上传进度及失败原因；下载和移除均校验对象归属，失败重试不能产生重复附件。",
    srs: [
      {
        id: "sr-attachment-upload",
        title: "附件上传进度与失败重试",
        percent: 70,
        statusChange: { from: "待开发", to: "开发中", at: "2026-11-17T02:00:00.000Z" },
      },
      {
        id: "sr-attachment-download",
        title: "附件下载与访问范围校验",
        percent: 99,
        certain: true,
        merged: true,
        statusChange: { from: "待合入", to: "待验收", at: "2026-11-17T04:00:00.000Z" },
      },
      { id: "sr-attachment-removal", title: "附件移除确认与列表同步", percent: 99, certain: true },
    ],
  },
  {
    id: "ir-workspace-shortcuts",
    title: "工作台快捷入口",
    originalText:
      "成员可收藏常用业务入口并调整顺序，通过键盘快速进入；失效入口应说明原因，个人收藏与排序不得影响其他成员。",
    srs: [
      {
        id: "sr-shortcut-favorites",
        title: "常用入口收藏与取消收藏",
        percent: 99,
        certain: true,
        merged: true,
        accepted: true,
        statusChange: { from: "待验收", to: "已完成", at: "2026-11-17T05:00:00.000Z" },
      },
      {
        id: "sr-shortcut-ordering",
        title: "快捷入口排序与个人隔离",
        percent: 99,
        certain: true,
        merged: true,
        accepted: true,
      },
      { id: "sr-shortcut-keyboard", title: "快捷入口键盘操作与失效提示" },
    ],
  },
  {
    id: "ir-notifications",
    title: "通知中心",
    srs: [
      {
        id: "sr-notification-inbox",
        title: "通知列表与阅读状态",
        percent: 99,
        certain: true,
        merged: true,
        accepted: true,
        statusChange: { from: "待验收", to: "已完成", at: "2026-11-14T01:30:00.000Z" },
      },
      {
        id: "sr-notification-navigation",
        title: "通知跳转与业务定位",
        percent: 55,
        statusChange: { from: "待开发", to: "开发中", at: "2026-11-18T01:30:00.000Z" },
      },
      {
        id: "sr-notification-deduplication",
        title: "重复投递去重",
        percent: 99,
        certain: true,
        statusChange: { from: "开发中", to: "待合入", at: "2026-11-18T03:15:00.000Z" },
      },
    ],
  },
  {
    id: "ir-audit-archive",
    title: "操作审计",
    srs: [
      {
        id: "sr-audit-retention",
        title: "审计查询与留存",
        percent: 99,
        certain: true,
        merged: true,
        accepted: true,
        statusChange: { from: "待验收", to: "已完成", at: "2026-11-14T02:30:00.000Z" },
      },
      {
        id: "sr-audit-archive-traceability",
        title: "归档记录追溯",
        percent: 99,
        certain: true,
        merged: true,
        statusChange: { from: "待合入", to: "待验收", at: "2026-11-18T06:00:00.000Z" },
      },
    ],
  },
];

export function createPrototypeReleaseRequirements() {
  const srs = requirements.flatMap((item) =>
    item.srs.map((sr) => systemRequirement("demo-aurora", item.id, sr.id, sr.title)),
  );
  const groups = requirements.map((item) => ({
    ...group(
      "demo-aurora",
      item.id,
      item.title,
      srs.filter((sr) => sr.irId === item.id),
    ),
    originalText: item.originalText ?? item.title,
  }));
  return { srs, groups };
}

/** 在共享材料、冻结与分支初始化后一次写入同一 workflow，后续读取只做投影。 */
export function initializePrototypeReleaseProgress(srs: AIReqSystemRequirement[]): void {
  for (const requirement of requirements) {
    for (const sample of requirement.srs) {
      const sr = srs.find(
        (row) =>
          row.projectId === "demo-aurora" && row.irId === requirement.id && row.id === sample.id,
      ) as InternalSystemRequirement | undefined;
      if (!sr) continue;
      sr.automaticCodeMerge = false;
      const at = sample.statusChange?.at ?? "2026-11-16T08:00:00.000Z";
      const codeVersion = `${sr.id}-head`;
      if (sample.percent !== undefined) {
        sr.progress = {
          percent: sample.accepted ? 100 : sample.percent,
          aiPercent: sample.percent,
          merged: sample.merged ?? false,
          certain: sample.certain ?? false,
          branch: sr.trackingBranch!.name,
          analysedAt: at,
          codeVersion,
          defaultVersion: "sample-default-sample-repository-demo-aurora",
          implemented: sample.percent > 0 ? [`${sr.title}的主要业务路径已覆盖。`] : [],
          remaining: sample.certain
            ? []
            : [sample.percent === 0 ? "调整方案后等待开发提交。" : "异常恢复与边界行为待完善。"],
          issues: sample.certain
            ? []
            : [{ title: "验收证据待补充", detail: "需核对异常恢复及重复操作的验收结果。" }],
          activity: sample.percent > 0 ? [{ commit: codeVersion, message: sr.title, at }] : [],
        };
      }
      sr.status = sample.accepted ? "completed" : sample.percent ? "developing" : "pending";
      if (sample.percent) sr.startedAt = "2026-11-13T01:00:00.000Z";
      if (sample.merged) {
        sr.codeMerge = { commit: codeVersion, branch: "main", checkedAt: at, files: [] };
      }
      if (sample.accepted) {
        sr.testAcceptance = {
          operationId: `sample-test-${sr.id}`,
          outcome: "passed",
          employeeId: sr.testingEmployeeId!,
          at,
          reason: "已按验收标准验证正常、失败恢复及重复操作，结果通过。",
          codeVersion,
        };
      }
      if (sample.statusChange) sr.statusChange = structuredClone(sample.statusChange);
    }
  }
}
