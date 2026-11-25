const projects = [
  { id: "gmockdev01", name: "协作平台开发", domains: [{ id: "900001", name: "协作平台开发" }, { id: "900003", name: "时序分析" }] },
  { id: "gmockdev02", name: "工作台开发", domains: [{ id: "900002", name: "工作台开发" }, { id: "900004", name: "物理验证" }] },
  { id: "gmockdev03", name: "模型库开发", domains: [{ id: "900005", name: "模型归档" }] },
  { id: "gmocklab01", name: "工具试用", domains: [{ id: "900006", name: "试用反馈" }] },
];

const requirements = [
  {
    projectId: "gmockdev01",
    domain: "900001",
    businessNo: "IR20990101000001",
    name: "按需求域筛选需求列表",
    description: [
      "## 背景\n\n项目成员需要快速定位自己负责的需求。切换需求域后保留已选择的进展筛选。",
      ...Array.from(
        { length: 12 },
        (_, index) =>
          `### 验收场景 ${index + 1}\n\n从项目总览进入需求列表，选择需求域并设置进展筛选。返回列表时，仍可查看筛选结果和打开过的需求。无匹配项时可以清空筛选条件，再次查看全部需求。`,
      ),
    ].join("\n\n"),
    process: "开发",
    delivererOwner: "a00000003",
    owner: null,
    pi: "101",
    piName: "体验优化",
  },
  {
    projectId: "gmockdev01",
    domain: "900001",
    businessNo: "IR20990101000002",
    name: "统一需求列表的空状态提示",
    description: "<p>筛选无结果时提示用户调整筛选条件。</p>",
    process: "完成",
    delivererOwner: "a00000002",
    owner: "a00000004",
    seId: "a00000005",
    de: "a00000006",
    te: "a00000007",
    pi: "101",
    piName: "体验优化",
  },
  {
    projectId: "gmockdev01",
    domain: "900001",
    businessNo: "IR20990101000003",
    name: "明确需求延期的通知范围",
    description: "<p>梳理延期时需要通知的项目角色。</p>",
    process: "分析",
    owner: "a00000008",
    pi: null,
    piName: null,
  },
  {
    projectId: "gmockdev02",
    domain: "900002",
    businessNo: "IR20990101000004",
    name: "展示最近访问的项目",
    description: "<p>从工作台快速打开最近访问的项目。</p>",
    process: "测试",
    pi: "201",
    piName: "工作台导航",
  },
  {
    projectId: "gmockdev01", domain: "900003", businessNo: "IR20990101000005",
    name: "批量汇总时序违例", description: "从多个角的 STA 报告中汇总端点、裕量和运行条件。",
    process: "初始", pi: "102", piName: "时序签核", owner: null,
  },
  {
    projectId: "gmockdev01", domain: "900003", businessNo: "IR20990101000006",
    name: "比较不同工艺角的时序报告", description: "同一端点按工艺角展示最差路径。",
    process: "测试", pi: "102", piName: "时序签核", te: "a00000007",
  },
  {
    projectId: "gmockdev01", domain: "900003", businessNo: "IR20990101000007",
    name: "记录 STA 运行参数", description: "保留约束版本、工具版本和运行目录。",
    process: "测试", pi: "103", piName: "追溯与归档",
  },
  {
    projectId: "gmockdev02", domain: "900002", businessNo: "IR20990101000008",
    name: "导出 DRC 分类摘要", description: "<p>按规则和版图单元导出 CSV。</p>",
    process: "开发", pi: "202", piName: "版图检查",
  },
  {
    projectId: "gmockdev02", domain: "900004", businessNo: "IR20990101000009",
    name: "LVS 差异归类", description: "区分开路、短路以及器件参数不匹配。",
    process: "分析", pi: null, piName: null,
  },
  {
    projectId: "gmockdev02", domain: "900004", businessNo: "IR20990101000010",
    name: "定位版图差异", description: "将报告中的层次路径关联到单元。",
    process: "完成", pi: "202", piName: "版图检查",
  },
];

const comments = [
  {
    id: "00000000000040008000000000000001",
    author: "a00000002",
    createdAt: "2026-11-02 14:00:00",
    detail: [
      "## 需求澄清记录\n\n讨论后补充以下验收要点。",
      ...Array.from(
        { length: 12 },
        (_, index) =>
          `### 验收要点 ${index + 1}\n\n检查有结果、无结果和切换需求域三种场景。记录实际显示的条目数，确认重新进入列表后仍可读取需求。`,
      ),
    ].join("\n\n"),
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    author: "a00000003",
    createdAt: "2026-11-03 09:00:00",
    detail: "请补充一个无权限需求域的验收场景。\n确认筛选项只包含当前账号可见的需求域。",
  },
];

export function initialCatalogue() {
  const issues = requirements.map((item, index) => {
    const { projectId, ...fields } = item;
    const first = index === 0;
    const record = {
      ...fields, id: String(9000000101 + index),
      creator: "a00000001", submitter: "a00000001", createDate: "2026-11-01 09:00:00",
      customProps: [{ name: "来源", value: "需求共创" }],
      labels: first ? [{ name: "体验优化" }, { name: "需求域" }] : index === 1 ? [{ name: "体验优化" }] : [],
      estimatedWorkloadManday: first ? 3 : 8, sumWorkloadManday: first ? 5 : 9,
      priorityLevel: first ? "高" : "中", needBreak: index >= 4, archived: false,
      ...(first && { rrBusinessNo: "RR20990101000001", completedAnalysisTime: "2026-11-02 08:00:00" }),
      ...(index === 5 && {
        baseline: "已纳入基线", demandSource: "设计验证", serviceName: "STA 报告工具",
        relatedOwner: ["a00000005", "a00000007"], board: { family: "演示芯片", revision: 2 },
        attachment: [{ name: "示例时序报告.txt", size: 1024 }], expectedImplementationDate: "2026-12-15",
        turnTestTime: "2026-11-20 10:00:00", estimatedWorkloadManday: 2.5, needDevelop: true,
      }),
    };
    return { projectId, record, comments: first ? comments : [] };
  });
  return { projects, issues, nextSequence: issues.length + 1 };
}
