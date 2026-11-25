import { z } from "zod";
import {
  AIREQ_AGENT_ROLES,
  AIREQ_DOCUMENT_PATHS,
  AIREQ_PROPOSAL_COLUMNS,
  AIREQ_REQUIREMENT_COMMENT_MAX_LENGTH,
} from "@zcode/services/aireq";
import type { AIReqRemotePath } from "@zcode/services/aireq";

const id = z.string().min(1);
const revision = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const text = z.string();
const commandTargetSchema = z
  .object({
    projectId: id.optional(),
    irId: id.optional(),
  })
  .strict();
const workflowTargetSchema = z
  .object({
    ...commandTargetSchema.shape,
    discussionPhase: z.enum(["requirements", "solution"]).optional(),
  })
  .strict();
const target = z.object({ projectId: id, irId: id }).strict();
const proposalColumn = z.enum(AIREQ_PROPOSAL_COLUMNS);
export const proposalTablePreferencesSchema = z
  .strictObject({
    autoFit: z.boolean().optional(),
    columns: z.array(proposalColumn).min(1).max(AIREQ_PROPOSAL_COLUMNS.length),
    sort: z.strictObject({
      column: proposalColumn,
      direction: z.enum(["ascending", "descending"]),
    }),
  })
  .refine(
    ({ columns, sort }) =>
      new Set(columns).size === columns.length &&
      (columns.includes(sort.column) ||
        (sort.column === "date" && sort.direction === "descending")),
  );
const actionSchema = z.union([
  z.strictObject({
    type: z.enum(["addProjectRoleMember", "removeProjectRoleMember"]),
    operationId: id,
    projectId: id,
    employeeId: z.string().regex(/^[a-z][0-9]{8}$/),
    role: z.enum(["development", "testing"]),
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
  z.strictObject({
    ...target.shape,
    operationId: id,
    type: z.literal("confirmDocumentVersion"),
    snapshot: z.string().regex(/^[a-f0-9]{64}$/),
  }),
  z.strictObject({
    ...target.shape,
    operationId: id,
    type: z.literal("reviewDocuments"),
    agent: z.enum(["requirements", "solution"]),
  }),
]);
const modelInput = z
  .object({
    defaultModel: id,
    agents: z.array(
      z
        .object({
          id: z.enum(AIREQ_AGENT_ROLES),
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
  validateDocumentVersion: z.tuple([target]),
  readWorkflow: z.tuple([workflowTargetSchema]),
  "projects.refreshSnapshot": z.tuple([workflowTargetSchema]),
  readRequirementDetails: z.tuple([target]),
  "requirementComments.list": z.tuple([target]),
  "requirementComments.add": z.tuple([
    target,
    z
      .string()
      .max(AIREQ_REQUIREMENT_COMMENT_MAX_LENGTH)
      .refine((body) => Boolean(body.trim()) && !body.includes("\0")),
  ]),
  "requirementComments.delete": z.tuple([target, z.string().min(1).max(36)]),
  "proposals.syncToRedZone": z.tuple([]),
  "proposalTable.readPreferences": z.tuple([]),
  "proposalTable.savePreferences": z.tuple([proposalTablePreferencesSchema, z.boolean()]),
  command: z.tuple([actionSchema, commandTargetSchema, revision]),
  retryMaterial: z.tuple([target.extend({ releaseId: text, path: id, sha256: id }).strict()]),
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
        workDirectory: text,
      })
      .strict(),
  ]),
  "models.save": z.tuple([modelInput, revision]),
  "prompts.save": z.tuple([z.record(z.string(), text), revision]),
  "skillDesign.session": z.tuple([id]),
  "skillDesign.read": z.tuple([id]),
  "skillDesign.saveDraft": z.tuple([id, draftFields]),
  "skillDesign.prompt": z.tuple([id, draftFields]),
  "skillDesign.readPreview": z.tuple([id]),
  "skillDesign.listSkills": z.tuple([id]),
  "skillDesign.savePreview": z.tuple([id, z.enum(["project", "user"]), revision, id]),
} satisfies Record<AIReqRemotePath, z.ZodType>;
