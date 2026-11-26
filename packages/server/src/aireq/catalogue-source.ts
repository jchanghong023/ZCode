import { cloudDragonProposalFields, type CloudDragonRequirement } from "./clouddragon.js";
import { updateImportedRequirement } from "./document-versions.js";
import { contentVersion } from "./content-digest.js";
import { sessionRef } from "./fixture-builders.js";
import { projectSettingsForSource } from "./project-settings.js";
import { prototypeIrRoot } from "./proposal-storage.js";
import { production } from "./production-store.js";
import type { ReceivedCatalogue, TransferPackage } from "./file-exchange.js";
import type { Project, RequirementGroup, WorkflowState } from "./workflow-state.js";

export interface PrototypeCatalogue {
  projects: Project[];
  requirements: RequirementGroup[];
  details: ReadonlyMap<string, ReadonlyMap<string, CloudDragonRequirement>>;
  failures: string[];
}

export function mergeSourceRequirement(
  projectId: string,
  item: CloudDragonRequirement,
  domainName: string | undefined,
  existing: RequirementGroup | undefined,
): RequirementGroup {
  // 业务号仅用于关联；云龙标题缺失时不将其伪装成需求名称。
  const title = item.name?.trim() ?? "";
  const originalText =
    item.description
      .replace(/<br\s*\/?\s*>|<\/(?:p|div|li)>/gi, "\n")
      .replace(/<\/?[a-z][^>]*>/gi, "")
      .replace(/&nbsp;/gi, " ")
      .trim() || title;
  const submittedBy = item.submitter.trim() || item.creator.trim();
  const personnel = {
    delivererOwner: item.delivererOwner || undefined,
    owner: item.owner || undefined,
    seId: item.seId || undefined,
    de: item.de || undefined,
    te: item.te || undefined,
  };
  const process = item.process || undefined;
  const releaseId = item.pi?.trim() ?? "";
  const releaseName = releaseId ? item.piName?.trim() || undefined : undefined;
  const sourceDate = item.createDate.trim();
  const createdAt = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(sourceDate)
    ? sourceDate.replace(" ", "T") + "+08:00"
    : sourceDate;
  const cloudFields = cloudDragonProposalFields(item, domainName);
  if (existing) {
    if (
      existing.title === title &&
      existing.originalText === originalText &&
      existing.sourceDescription === item.description &&
      existing.submittedBy === submittedBy &&
      existing.delivererOwner === personnel.delivererOwner &&
      existing.owner === personnel.owner &&
      existing.seId === personnel.seId &&
      existing.de === personnel.de &&
      existing.te === personnel.te &&
      existing.process === process &&
      existing.releaseId === releaseId &&
      existing.releaseName === releaseName &&
      existing.createdAt === createdAt &&
      JSON.stringify(existing.cloudFields) === JSON.stringify(cloudFields)
    )
      return existing;
    return {
      ...existing,
      title,
      originalText,
      sourceDescription: item.description,
      submittedBy,
      ...personnel,
      process,
      releaseId,
      releaseName,
      createdAt,
      cloudFields,
      revision: existing.revision + 1,
    };
  }
  return {
    id: item.businessNo,
    projectId,
    releaseId,
    releaseName,
    title,
    originalText,
    sourceDescription: item.description,
    submittedBy,
    ...personnel,
    process,
    createdAt,
    cloudFields,
    documentPath: `${prototypeIrRoot(item.businessNo)}/requirements.md`,
    revision: 1,
    srIds: [],
    sessions: production
      ? [
          sessionRef(
            projectId,
            item.businessNo,
            production.zone === "red" ? "solution" : "requirements",
          ),
        ]
      : [
          sessionRef(projectId, item.businessNo, "requirements"),
          sessionRef(projectId, item.businessNo, "solution"),
        ],
    documentHistory: [],
    documentReviews: [],
  };
}

export function projectionForRed(
  source: ReceivedCatalogue | undefined,
  state: WorkflowState,
): PrototypeCatalogue {
  const directory = source?.projects ?? [];
  const details = new Map(
    directory.map((project) => [
      project.id,
      new Map(project.requirements.map(({ source: ir }) => [ir.businessNo, ir])),
    ]),
  );
  return {
    projects: directory.map(projectSettingsForSource),
    details,
    failures: [],
    requirements: state.requirements.filter((ir) => details.get(ir.projectId)?.has(ir.id)),
  };
}

export function mergeRedSnapshot(state: WorkflowState, packet: TransferPackage) {
  const next = structuredClone(state);
  const changedDocuments: RequirementGroup[] = [];
  let activityChanged = false;
  const byProject = new Map<string, Map<string, RequirementGroup>>();
  for (const known of next.requirements) {
    const rows = byProject.get(known.projectId) ?? new Map<string, RequirementGroup>();
    rows.set(known.id, known);
    byProject.set(known.projectId, rows);
  }
  next.projects = packet.data.projects.map(projectSettingsForSource);
  for (const project of packet.data.projects) {
    const rows = byProject.get(project.id) ?? new Map<string, RequirementGroup>();
    for (const { source: ir, domainName, markdown, irDocument } of project.requirements) {
      const record = mergeSourceRequirement(project.id, ir, domainName, rows.get(ir.businessNo));
      if (markdown !== undefined) {
        const previous = record.irDocument;
        const received = irDocument ?? {};
        const changedActivity =
          !previous ||
          previous.version !== received.version ||
          previous.lastConfirmedVersion !== received.lastConfirmedVersion ||
          previous.updatedAt !== received.updatedAt;
        if (changedActivity) {
          record.irDocument = received;
          activityChanged = true;
        }
        if (
          updateImportedRequirement(next, record, {
            projectId: project.id,
            irId: ir.businessNo,
            path: record.documentPath,
            kind: "ir",
            valid: true,
            content: markdown,
            ...contentVersion(markdown),
          })
        )
          changedDocuments.push(record);
        else if (changedActivity) record.revision++;
      }
      rows.set(ir.businessNo, record);
    }
    byProject.set(project.id, rows);
  }
  next.requirements = [...byProject.values()].flatMap((rows) => [...rows.values()]);
  return { next, changedDocuments, activityChanged };
}
