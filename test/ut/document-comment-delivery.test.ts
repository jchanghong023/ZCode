import { describe, expect, it, vi } from "vitest";
import type {
  AIReqRequirementComment,
  AIReqWorkflowView,
} from "../../packages/services/src/aireq/index.js";
import {
  documentComments,
  DocumentCommentDelivery,
} from "../../packages/ui/src/aireq/proposals/document-comment-delivery.js";

const target = { projectId: "project-a", irId: "IR001" };
const path = "docs/requirements/IR001/requirements.md";
const paragraph = "验收场景".repeat(1_500) + "\r\n\r\n";
const body = paragraph + "🧪".repeat(15_000) + "  \n";

function snapshot(content: string): AIReqWorkflowView {
  return {
    projectRoleMembers: [],
    projects: [],
    releases: [],
    srs: [],
    revision: 1,
    documentFormats: {
      "requirements.md": [],
      "proposal.md": [],
      "design.md": [],
      "tasks.md": [],
      "test-plan.md": [],
      "spec.md": [],
    },
    requirements: [
      {
        id: target.irId,
        projectId: target.projectId,
        releaseId: "",
        title: "",
        originalText: "",
        submittedBy: "",
        documentPath: path,
        createdAt: "",
        revision: 1,
        srIds: [],
        sessions: [],
        documentVersion: { number: 3 },
        documentHistory: [],
        documentReviews: [],
      },
    ],
    materials: [
      { ...target, path, kind: "ir", valid: true, content, sha256: "saved", size: content.length },
    ],
  };
}

describe("IR 文档评论同步", () => {
  it("分条标记计入上限，保留段落、代理对和所有正文字符", () => {
    const version = {
      number: 2,
      confirmation: { employeeId: "e12345678", confirmedAt: "2026-01-01" },
    };
    const parts = documentComments(target.irId, version, body, "batch");
    const fragments = parts.map((part, i) => {
      const prefix = `【IR001 · V2 · 已确认 · 第${i + 1}条／共${parts.length}条 · batch】\n\n`;
      expect(part.startsWith(prefix)).toBe(true);
      expect(part.length).toBeLessThanOrEqual(10_000);
      return part.slice(prefix.length);
    });
    expect(fragments[0]).toBe(paragraph);
    for (const fragment of fragments)
      expect(fragment).not.toMatch(/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/);
    expect(fragments.join("")).toBe(body);
  });

  it.each([false, true])(
    "回执丢失后只由人补发已核对的剩余分条，云龙已接纳=%s",
    async (accepted) => {
      const comments: AIReqRequirementComment[] = [];
      const readWorkflow = vi.fn().mockResolvedValue(snapshot(body));
      let fail = true;
      const addRequirementComment = vi.fn(async (scope, text: string) => {
        expect(scope).toEqual(target);
        const item = { id: String(comments.length + 1), body: text };
        if (comments.length === 1 && fail) {
          fail = false;
          if (accepted) comments.push(item);
          throw Error("ack lost");
        }
        comments.push(item);
        return item;
      });
      const delivery = new DocumentCommentDelivery({ readWorkflow, addRequirementComment }, target);
      await delivery.send();
      const failed = delivery.snapshot();
      expect(failed).toMatchObject({ phase: "unknown", sent: 1 });
      await delivery.send();
      expect(addRequirementComment).toHaveBeenCalledTimes(2);
      delivery.observeComments(comments, failed.commentsRevision);
      expect(delivery.snapshot()).toMatchObject({ phase: "remaining", sent: accepted ? 2 : 1 });
      expect(addRequirementComment).toHaveBeenCalledTimes(2);
      readWorkflow.mockResolvedValue(snapshot("更新后的正文"));
      await delivery.send();
      expect(delivery.snapshot().phase).toBe("done");
      expect(readWorkflow).toHaveBeenCalledTimes(1);
      expect(comments.map((item) => item.body.slice(item.body.indexOf("\n\n") + 2)).join("")).toBe(
        body,
      );
      await delivery.send();
      expect(comments.at(-1)?.body).toContain("更新后的正文");
    },
  );
});
