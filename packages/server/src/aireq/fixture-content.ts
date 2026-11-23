import type { AIReqRequirementGroup } from "@zcode/services/aireq";

/** 仅用于初始化 workflow；不保存可变业务事实，也不参与读取时回填。 */
export const prototypeRequirementDetails: Record<
  string,
  Pick<AIReqRequirementGroup, "originalText" | "createdAt" | "releaseId">
> = {
  "ir-auth": {
    originalText:
      "统一团队账号登录、会话恢复与设备管理；按角色限制业务访问并保留操作审计，新成员首次登录时能完成必要引导。",
    createdAt: "2026-11-03T01:00:00.000Z",
    releaseId: "release-2026-11",
  },
  "ir-dashboard": {
    originalText:
      "项目负责人需要集中查看团队指标与趋势，按时间和业务范围筛选；没有数据或读取失败时给出可区分的反馈。",
    createdAt: "2026-11-04T02:15:00.000Z",
    releaseId: "release-2026-11",
  },
  "ir-export": {
    originalText:
      "将当前筛选范围内的报表异步导出，展示任务状态并下载结果；下载失败时保留筛选条件，允许重新获取而不重复创建任务。",
    createdAt: "2026-11-05T03:30:00.000Z",
    releaseId: "release-2026-11",
  },
  "ir-mobile": {
    originalText:
      "完善移动协作工作台的导航、项目切换、通知阅读与个人资料展示，切换项目时不混入其他项目的通知或身份信息。",
    createdAt: "2026-11-03T06:00:00.000Z",
    releaseId: "mobile-release-2026-11",
  },
  "ir-mobile-offline": {
    originalText:
      "网络中断时说明当前离线状态，保留用户尚未提交的内容；网络恢复后由用户明确继续，不自动重放可能重复的业务操作。",
    createdAt: "2026-11-08T01:30:00.000Z",
    releaseId: "mobile-release-2026-12",
  },
  "draft-automation": {
    originalText:
      "将重复的业务处理整理为可复用流程，先明确触发条件、执行范围和结果记录，再决定哪些步骤可以自动执行、哪些需要人工确认。",
    createdAt: "2026-11-08T02:00:00.000Z",
    releaseId: "release-2026-12",
  },
  "draft-notification": {
    originalText:
      "按团队和业务事件配置提醒范围，允许用户查看投递及阅读状态；投递失败必须可追溯，重试不能造成重复提醒。",
    createdAt: "2026-11-08T03:15:00.000Z",
    releaseId: "release-2026-12",
  },
  "draft-mobile-search": {
    originalText:
      "在移动工作台按关键词检索当前项目的需求与讨论，结果展示命中位置；无结果、离线和读取失败应分别说明。",
    createdAt: "2026-11-09T04:30:00.000Z",
    releaseId: "mobile-release-2027-01",
  },
  "draft-feedback-intake": {
    originalText:
      "客户反馈希望按来源和业务场景归集，先保留客户原话，再由业务人员补充影响范围与期望结果。\n暂不自动拆分需求，也不自动安排版本内的开发任务。",
    createdAt: "2026-11-17T02:00:00.000Z",
    releaseId: "release-2026-12",
  },
};
