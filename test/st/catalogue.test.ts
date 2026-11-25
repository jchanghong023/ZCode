import { randomInt } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  AIREQ_REQUIREMENT_COMMENT_MAX_LENGTH,
  type AIReqProposalTablePreferences,
  type AIReqRequirementGroup,
  type AIReqRequirementListSyncReceipt,
  type AIReqWorkflowView,
} from "@zcode/services/aireq";
import { takeRequirement } from "./business.js";
import { connectST, unique } from "./client.js";
import { config, requireConfig } from "./config.js";
import { completeBusinessMaterial } from "./proposal-flow.js";

const invalidArguments = "操作参数无效，请检查输入并重试。";

function countRequirements(requirements: readonly AIReqRequirementGroup[]) {
  return {
    requirementCount: requirements.length,
    completedRequirementCount: requirements.filter(({ process }) => process === "完成").length,
    confirmedRequirementCount: requirements.filter(({ documentVersion }) =>
      Boolean(documentVersion?.confirmation),
    ).length,
  };
}

function countCurrentDocuments({ requirements, materials }: AIReqWorkflowView, projectId: string) {
  const paths = new Map(requirements.map((row) => [row.id, row.documentPath]));
  let count = 0;
  for (const file of materials) {
    if (
      file.kind !== "ir" ||
      file.srId ||
      file.projectId !== projectId ||
      paths.get(file.irId) !== file.path
    )
      continue;
    requireConfig(
      file.valid && typeof file.content === "string" ? true : undefined,
      "全量同步范围内每份现有需求文档均可读取",
    );
    count++;
  }
  return count;
}

describe("ST public AIReq catalogue", () => {
  it(
    "reads cloud requirement details and derives PI and project totals independently",
    async () => {
      const c = await connectST();
      try {
        const directory = await c.read();
        const release = requireConfig(
          directory.view.releases.find(({ requirementCount }) => requirementCount > 0),
          "包含 IR 的云龙 PI",
        );
        const { projectId } = release;
        const { view } = await c.read({ projectId });
        const requirement = requireConfig(
          view.requirements.find(
            (row) => row.projectId === projectId && row.releaseId === release.id,
          ),
          "可读取详情的云龙 IR",
        );
        // 只读详情不需要挑选原生会话，从同一页的项目投影取得业务键。
        const irId = requirement.id;
        const selection = { projectId, irId };
        const details = await c.call("readRequirementDetails", [selection]);
        expect(details).toEqual({ description: expect.any(String), fields: expect.any(Array) });
        for (const field of details.fields) {
          expect(field).toEqual({ name: expect.stringMatching(/\S/), value: expect.any(String) });
        }
        const fields = new Map(details.fields.map(({ name, value }) => [name, value]));
        expect(fields.size).toBe(details.fields.length);
        expect(fields.has("comments")).toBe(false);
        expect(fields.get("businessNo")).toBe(irId);
        const detailText = (name: string) => {
          const value = fields.get(name)?.trim();
          return value === "null" ? "" : (value ?? "");
        };
        expect(requirement.title).toBe(detailText("name") || irId);
        expect(requirement.releaseId).toBe(detailText("pi"));
        expect(requirement.process ?? "").toBe(detailText("process"));
        // 列表使用清理后的文案，详情保留带换行和标记的原始描述；用完整正文比对列表投影。
        const displayText = details.description
          .replace(/<br\s*\/?\s*>|<\/(?:p|div|li)>/gi, "\n")
          .replace(/<\/?[a-z][^>]*>/gi, "")
          .replace(/&nbsp;/gi, " ")
          .trim();
        expect(requirement.originalText).toBe(displayText || requirement.title);
        await expect(
          c.call("readRequirementDetails", [{ projectId: unique("missing-project"), irId }]),
        ).rejects.toThrow();

        expect(view.requirements.every((row) => row.projectId === projectId)).toBe(true);
        expect(view.projectRequirementCounts?.[projectId]).toEqual(
          countRequirements(view.requirements),
        );
        const byPI = new Map<string, AIReqRequirementGroup[]>();
        for (const row of view.requirements) {
          // 未分配 PI 的需求只计入项目总数，不能形成无 ID 的 Release。
          if (!row.releaseId) continue;
          const rows = byPI.get(row.releaseId) ?? [];
          rows.push(row);
          byPI.set(row.releaseId, rows);
        }
        const releases = view.releases.filter((release) => release.projectId === projectId);
        expect(releases.map(({ id }) => id).sort()).toEqual([...byPI.keys()].sort());
        for (const release of releases) {
          expect(release).toEqual({
            id: release.id,
            projectId,
            title: expect.stringMatching(/\S/),
            createdAt: expect.any(String),
            ...countRequirements(byPI.get(release.id)!),
          });
        }
        const piName = detailText("piName");
        if (piName) {
          expect(releases.find(({ id }) => id === release.id)?.title).toBe(piName);
        }
      } finally {
        await c.close();
      }
    },
    config.timeoutMs,
  );

  it(
    "adds and deletes only its own comment on a dedicated IR",
    async () => {
      const c = await connectST();
      try {
        const { selection } = await takeRequirement(c);
        const list = () => c.call("requirementComments.list", [selection]);
        const before = await list();
        for (const comment of before) {
          expect(comment).toEqual({
            id: comment.id === null ? null : expect.stringMatching(/\S/),
            body: expect.any(String),
            ...(comment.author === undefined ? {} : { author: expect.any(String) }),
            ...(comment.createdAt === undefined ? {} : { createdAt: expect.any(String) }),
          });
        }
        await expect(
          c.call("requirementComments.list", [
            { ...selection, projectId: unique("missing-project") },
          ]),
        ).rejects.toThrow();
        for (const invalid of [
          " \n\t",
          "测".repeat(AIREQ_REQUIREMENT_COMMENT_MAX_LENGTH + 1),
          "评审\0意见",
        ]) {
          await expect(c.call("requirementComments.add", [selection, invalid])).rejects.toThrow(
            invalidArguments,
          );
        }
        expect(await list()).toEqual(before);

        const body = `专用 IR 的系统测试评论 ${unique("comment")}\n第二行：检查原样回读。`;
        expect(before.some((comment) => comment.body === body)).toBe(false);
        let ownId: string | undefined;
        const existingIds = new Set(before.map(({ id }) => id));
        try {
          const added = await c.call("requirementComments.add", [selection, body]);
          const after = await list();
          const own = after.filter((comment) => comment.body === body);
          if (own.length === 1 && own[0]?.id && !existingIds.has(own[0].id)) ownId = own[0].id;
          expect(ownId).toEqual(expect.stringMatching(/\S/));
          expect(added).toMatchObject({ id: ownId, body });
          // 不假定新增评论排在头还是尾，既有评论的顺序与正文必须保留。
          expect(after.filter((comment) => comment.body !== body)).toEqual(before);
        } finally {
          // 新增可能已成功但回执/断言失败；只按本轮唯一完整正文识别且不碰预存 ID。
          if (!ownId) {
            const own = (await list()).filter((comment) => comment.body === body);
            if (own.length > 0) {
              expect(own).toHaveLength(1);
              const id = own[0]?.id;
              ownId = requireConfig(
                id && !existingIds.has(id) ? id : undefined,
                "可安全清理的本轮评论 ID",
              );
            }
          }
          if (ownId)
            expect(await c.call("requirementComments.delete", [selection, ownId])).toBeNull();
          expect(await list()).toEqual(before);
        }
      } finally {
        await c.close();
      }
    },
    config.timeoutMs,
  );

  it(
    "initializes table preferences once and reads them across clients by employee only",
    async () => {
      // 没有公开删除配置操作；每轮用未占用的测试工号，不改动用户已有配置。
      const suffix = randomInt(100_000_000);
      const employeeId = `z${String(suffix).padStart(8, "0")}`;
      const otherEmployeeId = `z${String((suffix + 1) % 100_000_000).padStart(8, "0")}`;
      const clientId = unique("preferences");
      const owner = await connectST(employeeId, clientId);
      let sameEmployee: Awaited<ReturnType<typeof connectST>> | undefined;
      let otherEmployee: Awaited<ReturnType<typeof connectST>> | undefined;
      try {
        sameEmployee = await connectST(employeeId);
        otherEmployee = await connectST(otherEmployeeId, clientId);
        requireConfig(
          (await owner.call("proposalTable.readPreferences", [])) === null &&
            (await otherEmployee.call("proposalTable.readPreferences", [])) === null
            ? true
            : undefined,
          "两名尚无列配置的专用测试工号",
        );
        const initial: AIReqProposalTablePreferences = {
          autoFit: true,
          columns: ["title", "id"],
          sort: { column: "date", direction: "descending" },
        };
        const update: AIReqProposalTablePreferences = {
          autoFit: false,
          columns: ["requester", "owner", "release"],
          sort: { column: "release", direction: "ascending" },
        };
        expect(await owner.call("proposalTable.savePreferences", [initial, true])).toEqual(initial);
        expect(await sameEmployee.call("proposalTable.readPreferences", [])).toEqual(initial);
        expect(await owner.call("proposalTable.savePreferences", [update, true])).toEqual(initial);
        for (const invalid of [
          { ...initial, columns: [] },
          { ...initial, columns: ["title", "title"] },
          { ...initial, columns: ["unknown"] },
          { ...initial, sort: { column: "owner", direction: "descending" } },
          { ...initial, sort: { column: "date", direction: "ascending" } },
        ]) {
          await expect(
            owner.call("proposalTable.savePreferences", [invalid, false] as never),
          ).rejects.toThrow(invalidArguments);
        }
        expect(await owner.call("proposalTable.readPreferences", [])).toEqual(initial);
        expect(await owner.call("proposalTable.savePreferences", [update, false])).toEqual(update);
        expect(await sameEmployee.call("proposalTable.readPreferences", [])).toEqual(update);
        expect(await otherEmployee.call("proposalTable.readPreferences", [])).toBeNull();
        expect(await otherEmployee.call("proposalTable.savePreferences", [initial, true])).toEqual(
          initial,
        );
        expect(await otherEmployee.call("proposalTable.readPreferences", [])).toEqual(initial);
        expect(await owner.call("proposalTable.readPreferences", [])).toEqual(update);
      } finally {
        await Promise.all([owner.close(), sameEmployee?.close(), otherEmployee?.close()]);
      }
    },
    config.timeoutMs,
  );

  it(
    "hands off all projects, unassigned IRs and current requirements documents after a same-page reconnect",
    async () => {
      // 操作不能限定项目；连拒绝探测也只允许在整套云龙目录和红区接收端均隔离时发送。
      requireConfig(
        config.isolatedRedZoneSync ? true : undefined,
        "ST_ISOLATED_RED_ZONE_SYNC=1（整个云龙目录和红区接收端均为隔离测试环境）",
      );
      const clientId = unique("red-zone");
      const pageId = crypto.randomUUID();
      const page = await connectST(config.employeeId, clientId, pageId);
      let reconnected: Awaited<ReturnType<typeof connectST>> | undefined;
      try {
        const { view } = await page.read();
        const counts = requireConfig(
          !view.releaseReadFailures?.length ? view.projectRequirementCounts : undefined,
          "所有项目均成功读取且有云龙需求统计的完整目录",
        );
        const release = requireConfig(
          view.releases.find(({ requirementCount }) => requirementCount > 0),
          "至少一个含有 IR 的 PI",
        );
        const count = Object.values(counts).reduce((sum, row) => sum + row.requirementCount, 0);
        requireConfig(
          Object.entries(counts).some(
            ([projectId, row]) => projectId !== release.projectId && row.requirementCount > 0,
          ) && count > view.releases.reduce((sum, row) => sum + row.requirementCount, 0)
            ? true
            : undefined,
          "另一项目的 IR 和未分配 PI 的 IR，用于区分全量同步与当前 PI 同步",
        );

        let documentCount = 0;
        let irId: string | undefined;
        for (const { id: projectId } of view.projects) {
          const { view: projectView } = await page.read({ projectId });
          const { requirements } = projectView;
          expect(counts[projectId]).toEqual(countRequirements(requirements));
          documentCount += countCurrentDocuments(projectView, projectId);
          if (projectId === release.projectId) {
            irId = requirements.find((row) => row.releaseId === release.id)?.id;
          }
        }
        if (documentCount === 0) {
          // 在隔离目录内用公开需求讨论生成本轮材料，不依赖其他 ST 先写入。
          const target = await takeRequirement(page);
          const updated = await completeBusinessMaterial(page, target);
          documentCount = countCurrentDocuments(updated.view, target.projectId);
          expect(documentCount).toBe(1);
        }
        await page.read({
          projectId: release.projectId,
          irId: requireConfig(irId, "当前 PI 下的 IR"),
        });
        await page.close();

        const otherPage = await connectST(config.employeeId, clientId);
        try {
          await expect(otherPage.call("proposals.syncToRedZone", [])).rejects.toThrow(
            "当前页面尚未加载云龙目录，请刷新项目后重试全量同步。",
          );
        } finally {
          await otherPage.close();
        }
        // 同页恢复不先读目录；成功回执证明不是在另一个页面重新载入相同数据。
        reconnected = await connectST(config.employeeId, clientId, pageId);
        const receipt = await reconnected.call("proposals.syncToRedZone", []);
        const statuses: readonly AIReqRequirementListSyncReceipt["status"][] = [
          "completed",
          "simulated",
        ];
        expect(statuses).toContain(receipt.status);
        expect(receipt).toEqual({
          status: receipt.status,
          projectCount: view.projects.length,
          count,
          documentCount,
        });
      } finally {
        await Promise.all([page.close(), reconnected?.close()]);
      }
    },
    config.timeoutMs,
  );
});
