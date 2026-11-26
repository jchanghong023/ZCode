import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import {
  cloudProjectSchema,
  cloudRequirementSchema,
  type CloudDragonRequirement,
} from "./clouddragon.js";
import { digestValue } from "./content-digest.js";
import { businessRule } from "./errors.js";
import type { ProductionStore } from "./production-store.js";
import type {
  RequirementListSnapshot,
  RequirementListTransfer,
} from "./requirement-list-transfer.js";

export const transferFilename = "aireq-transfer.json";

const requirement = z.strictObject({
  source: cloudRequirementSchema.refine(
    (ir) => !Object.hasOwn(ir, "comments"),
    "交接包不能包含云龙评论。",
  ),
  domainName: z.string().optional(),
  markdown: z.string().optional(),
  irDocument: z
    .strictObject({
      version: z.number().int().positive().optional(),
      lastConfirmedVersion: z.number().int().positive().optional(),
      updatedAt: z.iso.datetime().optional(),
    })
    .optional(),
});
const payload = z.strictObject({
  format: z.union([z.literal(1), z.literal(2)]),
  sequence: z.number().int().positive().safe(),
  projects: z.array(cloudProjectSchema.extend({ requirements: z.array(requirement) }).strict()),
});
const envelope = z.strictObject({ digest: z.string().regex(/^[\da-f]{64}$/), data: payload });
export type TransferPackage = z.infer<typeof envelope>;

export interface ReceivedCatalogue {
  sequence: number;
  digest: string;
  projects: {
    id: string;
    name: string;
    requirements: { source: CloudDragonRequirement; domainName?: string }[];
  }[];
}

export function catalogueFromTransfer({ data, digest }: TransferPackage): ReceivedCatalogue {
  return {
    sequence: data.sequence,
    digest,
    projects: data.projects.map((project) => ({
      ...project,
      requirements: project.requirements.map(({ source, domainName }) => ({ source, domainName })),
    })),
  };
}

function checkedPayload(snapshot: RequirementListSnapshot, sequence: number) {
  const data = payload.parse({
    format: 2,
    sequence,
    projects: snapshot.projects.map((project) => ({
      id: project.projectId,
      name: project.projectName,
      requirements: project.requirements.map((item) => {
        if (!item.source || item.source.businessNo !== item.irId)
          throw businessRule("交接缺少与 IR 业务号相符的云龙原始记录。");
        const { comments: _comments, ...source } = item.source;
        return {
          source,
          domainName: item.cloudFields?.domain,
          markdown: item.requirementsMarkdown,
          irDocument: item.irDocument,
        };
      }),
    })),
  });
  return { data, digest: digestValue(data) };
}

export function fileTransfer(store: ProductionStore): RequirementListTransfer {
  return {
    async publish(snapshot) {
      if (store.zone !== "yellow") throw businessRule("只允许黄区向红区发送交接包。");
      const sequence = (store.get<number>("outgoing-sequence") ?? 0) + 1;
      const packet = checkedPayload(snapshot, sequence);
      // 序号先落库，进程在更名后中断也不会为新内容复用已经发布的序号。
      store.set("outgoing-sequence", sequence);
      const staging = join(store.exchange, randomUUID() + ".tmp");
      try {
        await writeFile(staging, JSON.stringify(packet), { flag: "wx", flush: true });
        await rename(staging, join(store.exchange, transferFilename));
      } finally {
        await unlink(staging).catch((error: NodeJS.ErrnoException) => {
          if (error.code !== "ENOENT") throw error;
        });
      }
      const items = packet.data.projects.flatMap((project) => project.requirements);
      return {
        status: "completed",
        projectCount: packet.data.projects.length,
        count: items.length,
        documentCount: items.filter((item) => item.markdown !== undefined).length,
      };
    },
  };
}

/** A package is only a candidate until its metadata and imports commit together in the red workflow. */
export function readNewTransfer(
  store: ProductionStore,
  current: ReceivedCatalogue | undefined,
): TransferPackage | undefined {
  let bytes: string;
  try {
    bytes = readFileSync(join(store.exchange, transferFilename), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw businessRule("无法读取红区收件目录中的交接包。");
  }
  let packet: TransferPackage;
  try {
    packet = envelope.parse(JSON.parse(bytes));
  } catch {
    throw businessRule("交接包数据格式无效。");
  }
  const { data, digest } = packet;
  if (digestValue(data) !== digest) throw businessRule("交接包完整性校验失败。");
  if (current && data.sequence <= current.sequence) {
    if (current.sequence === data.sequence && digest !== current.digest)
      throw businessRule("同一交接序号的内容冲突。");
    return;
  }
  if (
    new Set(data.projects.map((p) => p.id)).size !== data.projects.length ||
    data.projects.some(
      (p) =>
        new Set(p.requirements.map((ir) => ir.source.businessNo)).size !== p.requirements.length,
    )
  )
    throw businessRule("交接包包含重复项目或 IR。");
  return packet;
}
