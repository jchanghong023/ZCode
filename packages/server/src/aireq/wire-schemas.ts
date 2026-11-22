import { z } from "zod";
import { AIREQ_AGENT_ROLES, AIREQ_DOCUMENT_PATHS } from "@zcode/services/aireq";
import type { AIReqRemotePath } from "@zcode/services/aireq";

const id = z.string().min(1);
const revision = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const text = z.string();
const employee = z.union([z.string().regex(/^[a-z][0-9]{8}$/), z.literal("")]);
const workflowTargetSchema = z
  .object({
    projectId: id.optional(),
    irId: id.optional(),
    srId: id.optional(),
    formalView: z.enum(["list", "detail"]).optional(),
    reviewAgent: z.enum(["a", "b", "c", "summary"]).optional(),
    proposalStep: z.enum(["requirements", "requirements-review", "solution", "intake"]).optional(),
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
  operationId: id,
  projectId: id.optional(),
  irId: id.optional(),
  srId: id.optional(),
};
const action = (type: string, fields: z.ZodRawShape = {}) =>
  z.object({ ...actionBase, type: z.literal(type), ...fields }).strict();
const actionSchema = z.union([
  action("requestProjectRoles", {
    projectId: id,
    roles: z
      .array(z.enum(["development", "testing"]))
      .min(1)
      .max(2),
    note: text.max(300).optional(),
  }),
  action("decideProjectRole", {
    projectId: id,
    registrationId: id,
    decision: z.enum(["approved", "rejected", "revoked"]),
  }),
  action("syncFormalDocuments", { projectId: id, irId: id }),
  action("createIdea", { originalText: text }),
  action("importIdeas", { originalTexts: z.array(text).min(1) }),
  action("updateIdea", { ideaId: id, ideaRevision: revision, originalText: text }),
  action("transferIdea", {
    ideaId: id,
    ideaRevision: revision,
    targets: z.array(z.object({ projectId: id, releaseId: id }).strict()).min(1),
  }),
  z
    .object({
      operationId: id,
      type: z.literal("saveDocumentFormats"),
      documentFormats: z.record(
        z.enum(Object.keys(AIREQ_DOCUMENT_PATHS)),
        z.array(
          z
            .string()
            .trim()
            .min(1)
            .regex(/^[^\r\n]+$/),
        ),
      ),
    })
    .strict(),
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
  action("confirmAlignment", {
    perspective: z.enum(["business", "development", "testing"]),
    version: id,
    reviewId: id,
    snapshotDigest: id,
  }),
  action("closeProposalPr", { candidate: id }),
  action("reviseProposalMaterial", {
    target: z.enum(["requirements", "solution", "test-plan"]),
    note: text,
  }),
  action("deleteRequirement", { projectId: id, irId: id }),
  action("acceptProposal", { reviewId: id, snapshotDigest: id }),
  action("submitProposalReview", {
    ...target.shape,
    kind: z.enum(["original", "full"]),
    snapshotDigest: id,
  }),
  action("runRequirementsReview"),
  action("returnProposal", { reason: text }),
  action("publishProposal", { candidate: id }),
]);
const modelSettings = z
  .object({
    defaultModel: id,
    agents: z.array(
      z
        .object({
          id: z.enum(AIREQ_AGENT_ROLES),
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
const draftFields = z
  .object({
    goal: text,
    when: text,
    inputs: text,
    outputs: text,
    boundaries: text,
    references: text,
    example: text,
  })
  .strict();

/** 精确白名单拒绝退役路径；配置读取统一经 bootstrap，不为本地读取端口保留 RPC。 */
export const argumentSchemas = {
  readPresence: z.tuple([]),
  readWorkflow: z.tuple([workflowTargetSchema]),
  readPrHandoff: z.tuple([target]),
  command: z.tuple([actionSchema, workflowTargetSchema, revision]),
  retryMaterial: z.tuple([
    target.extend({ releaseId: id, path: id, sha256: id, round: revision.optional() }).strict(),
  ]),
  retrySession: z.tuple([workflowTargetSchema, id]),
  "projects.saveRepository": z.tuple([
    z
      .object({
        operationId: id,
        expectedRevision: revision,
        projectId: id.optional(),
        name: text,
        repositoryUrl: text,
        defaultBranch: text,
      })
      .strict(),
  ]),
  "models.save": z.tuple([modelSettings, revision]),
  "prompts.save": z.tuple([z.record(z.string(), text), revision]),
  "skillDesign.session": z.tuple([id]),
  "skillDesign.read": z.tuple([id]),
  "skillDesign.saveDraft": z.tuple([id, draftFields]),
  "skillDesign.prompt": z.tuple([id, draftFields]),
  "skillDesign.readPreview": z.tuple([id]),
  "skillDesign.listSkills": z.tuple([id]),
  "skillDesign.savePreview": z.tuple([id, z.enum(["project", "user"]), revision, id]),
} satisfies Record<AIReqRemotePath, z.ZodType>;
