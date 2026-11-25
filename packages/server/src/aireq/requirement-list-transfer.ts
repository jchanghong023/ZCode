import type {
  AIReqRequirementListSyncReceipt,
  AIReqRequirementPersonnel,
} from "@zcode/services/aireq";

interface RequirementListEntry extends AIReqRequirementPersonnel {
  irId: string;
  title: string;
  description: string;
  releaseId: string;
  releaseName?: string;
  submittedBy: string;
  submittedAt: string;
  process?: string;
}

export interface RequirementListSnapshot {
  projects: {
    projectId: string;
    projectName: string;
    requirements: (RequirementListEntry & { requirementsMarkdown?: string })[];
  }[];
}

export interface RequirementListTransfer {
  /** Update the catalogue and imported requirements by project and IR in separate storage from red-zone files. */
  publish(snapshot: RequirementListSnapshot): Promise<AIReqRequirementListSyncReceipt>;
}

interface MockRedZoneProject {
  name: string;
  requirements: RequirementListEntry[];
  documents: Map<string, ReadonlyMap<string, string>>;
  importedRequirements?: ReadonlyMap<string, string>;
}

export function createMockRequirementListTransfer(
  received = new Map<string, MockRedZoneProject>(),
): RequirementListTransfer {
  return {
    async publish(snapshot) {
      const updates = new Map<string, MockRedZoneProject>();
      let count = 0;
      let documentCount = 0;
      for (const project of snapshot.projects) {
        const previous = received.get(project.projectId);
        const importedRequirements = new Map(previous?.importedRequirements);
        const requirements = project.requirements.map(({ requirementsMarkdown, ...entry }) => {
          if (requirementsMarkdown !== undefined) {
            importedRequirements.set(entry.irId, requirementsMarkdown);
            documentCount++;
          }
          return entry;
        });
        count += requirements.length;
        updates.set(project.projectId, {
          name: project.projectName,
          requirements,
          documents: previous?.documents ?? new Map(),
          importedRequirements,
        });
      }
      for (const [id, project] of updates) received.set(id, project);
      return { status: "simulated", projectCount: updates.size, count, documentCount };
    },
  };
}
