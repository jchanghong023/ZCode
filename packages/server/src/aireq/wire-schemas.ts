import { z } from "zod";
import type { AIReqRemotePath } from "@zcode/services/aireq";

const id = z.string().min(1);
const revision = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const text = z.string();
const employee = z.union([z.string().regex(/^[a-z][0-9]{8}$/), z.literal("")]);
const operation = { operationId: id, expectedRevision: revision };
export const selectionSchema = z
  .object({
    projectId: id.optional(),
    irId: id.optional(),
    srId: id.optional(),
    formalView: z.enum(["list", "detail"]).optional(),
    reviewAgent: z.enum(["a", "b", "c", "summary"]).optional(),
    materialPath: text.optional(),
    proposalEditing: z.boolean().optional(),
    proposalStep: z.enum(["requirements", "requirements-review", "solution", "intake"]).optional(),
    freeDraftId: id.optional(),
    proposalDraftId: id.optional(),
    proposalDraftReleaseId: id.optional(),
    irAcceptance: z.boolean().optional(),
    freeSessionId: id.optional(),
    freeFiles: z.boolean().optional(),
    stage: z.enum(["planning", "executing", "pr", "solution"]).optional(),
    stageRound: revision.optional(),
    discussionPhase: z.enum(["requirements", "solution"]).optional(),
  })
  .strict();
const target = z.object({ projectId: id, irId: id }).strict();
const contacts = z
  .object({
    business: employee.optional(),
    development: employee.optional(),
    testing: employee.optional(),
  })
  .strict();
const actionBase = {
  ...operation,
  projectId: id.optional(),
  irId: id.optional(),
  srId: id.optional(),
};
const action = (type: string, fields: z.ZodRawShape = {}) =>
  z.object({ ...actionBase, type: z.literal(type), ...fields }).strict();
const actionSchema = z.union([
  action("createIdea", { originalText: text }),
  action("importIdeas", { originalTexts: z.array(text).min(1) }),
  action("updateIdea", { ideaId: id, ideaRevision: revision, originalText: text }),
  action("transferIdea", {
    ideaId: id,
    ideaRevision: revision,
    targets: z.array(z.object({ projectId: id, releaseId: id }).strict()).min(1),
  }),
  action("createRelease", { title: text }),
  action("createProposal", {
    originalText: text,
    sourceIrId: id.optional(),
    clientDraftId: id.optional(),
    releaseId: id,
  }),
  action("importProposals", {
    releaseId: id,
    proposals: z
      .array(
        z
          .object({
            originalText: text,
            businessDocument: z.string().min(1).max(1_048_576).optional(),
          })
          .strict(),
      )
      .min(1),
  }),
  action("assignContacts", { contacts }),
  action("runFullReview"),
  action("approveFullReview", { reviewId: id, snapshotDigest: id }),
  action("confirmAlignment", {
    perspective: z.enum(["business", "development", "testing"]),
    version: id,
  }),
  action("closeProposalPr", { candidate: id }),
  action("retrySrBranch", { srId: id }),
  action("reviseProposalMaterial", {
    target: z.enum(["requirements", "solution", "test-plan"]),
    note: text,
  }),
  action("deleteRequirement", { version: z.literal(1), projectId: id, irId: id }),
  action("acceptProposal", { reviewId: id.optional(), snapshotDigest: id.optional() }),
  action("runRequirementsReview"),
  action("returnProposal", { reason: text }),
  action("confirmProposal", { version: id }),
  action("publishProposal", { candidate: id }),
]);
const filter = z
  .object({
    projectId: id.optional(),
    releaseId: id.optional(),
    irId: id.optional(),
    srId: id.optional(),
    srSearch: text.optional(),
  })
  .strict();
const timestamp = text.refine((value) => Number.isFinite(Date.parse(value)));
const historyFilter = filter
  .extend({
    status: z.enum(["running", "succeeded", "failed", "skipped"]).optional(),
    since: timestamp.optional(),
    until: timestamp.optional(),
  })
  .strict();
const modelSettings = z
  .object({
    defaultModel: id,
    agents: z.array(
      z
        .object({
          id,
          name: text,
          nameEn: text,
          description: text,
          descriptionEn: text,
          model: id,
          reasoning: id,
        })
        .strict(),
    ),
  })
  .strict();
const modelBinding = z
  .object({
    role: id,
    roleName: text,
    modelKey: id,
    modelName: text,
    providerId: id,
    modelId: id,
    reasoning: id,
    inherited: z.boolean(),
    configurationRevision: revision,
  })
  .strict();
const draft = z
  .object({
    goal: text,
    when: text,
    inputs: text,
    outputs: text,
    boundaries: text,
    references: text,
    example: text,
    notes: z.array(text),
  })
  .strict();
const page = z.number().int().min(1);
const pageSize = z.union([z.literal(25), z.literal(50)]);

/** 每个可调用业务操作都有精确的传输形状；额外调试字段和畸形嵌套值在领域执行前拒绝。 */
export const argumentSchemas = {
  readWorkflow: z.tuple([selectionSchema]),
  readPrHandoff: z.tuple([target]),
  command: z.tuple([actionSchema, selectionSchema, revision]),
  retryMaterial: z.tuple([text, selectionSchema]),
  retrySession: z.tuple([selectionSchema]),
  "progress.recordTest": z.tuple([
    id,
    id,
    id,
    z
      .object({
        ...operation,
        expectedCodeVersion: text,
        outcome: z.enum(["passed", "failed"]),
        reason: text,
      })
      .strict(),
  ]),
  "progress.cleanupPreview": z.tuple([id, id]),
  "progress.cleanupBranches": z.tuple([
    id,
    id,
    z.object({ ...operation, branches: z.array(text) }).strict(),
  ]),
  "planning.updateSr": z.tuple([
    id,
    id,
    id,
    z
      .object({
        ...operation,
        developerEmployeeId: employee.optional(),
        testingEmployeeId: employee.optional(),
        plannedStart: text.optional(),
        plannedEnd: text.optional(),
      })
      .strict(),
  ]),
  "projects.saveRepository": z.tuple([
    z
      .object({
        ...operation,
        projectId: id.optional(),
        name: text,
        repositoryUrl: text,
        defaultBranch: text,
      })
      .strict(),
  ]),
  "models.read": z.tuple([]),
  "models.save": z.tuple([modelSettings, revision]),
  "models.revision": z.tuple([]),
  "models.bindingChanged": z.tuple([modelBinding]),
  "prompts.read": z.tuple([]),
  "prompts.save": z.tuple([z.record(z.string(), text), revision]),
  "skillDesign.session": z.tuple([id]),
  "skillDesign.binding": z.tuple([id]),
  "skillDesign.workspaceIdentity": z.tuple([id]),
  "skillDesign.read": z.tuple([id]),
  "skillDesign.saveDraft": z.tuple([id, draft]),
  "skillDesign.prompt": z.tuple([id, draft]),
  "skillDesign.temporaryDirectory": z.tuple([id]),
  "skillDesign.readPreview": z.tuple([id]),
  "skillDesign.listSkills": z.tuple([text]),
  "skillDesign.savePreview": z.tuple([id, text, id, z.enum(["project", "user"]), revision, id]),
  "progressScheduler.read": z.tuple([]),
  "progressScheduler.queryTasks": z.tuple([filter, page, pageSize]),
  "progressScheduler.queryRuns": z.tuple([historyFilter, page, pageSize]),
  "progressScheduler.readRun": z.tuple([id]),
  "progressScheduler.setProjectEnabled": z.tuple([id, z.boolean()]),
  "progressScheduler.configure": z.tuple([
    z.boolean(),
    z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  ]),
  "progressScheduler.runNow": z.tuple([filter]),
} satisfies Record<AIReqRemotePath, z.ZodType>;
