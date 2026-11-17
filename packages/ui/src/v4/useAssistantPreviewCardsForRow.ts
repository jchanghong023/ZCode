import { useMemo } from "react";
import type { AssistantTextRow } from "@zcode/shared/zcode-protocol-v4";
import {
  buildAssistantPreviewCardsFromReferences,
  extractAssistantFileReferences,
  type AssistantPreviewCard,
} from "@/lib/assistantPreviewCards.js";

interface UseAssistantPreviewCardsForAssistantTextRowParams {
  row?: AssistantTextRow;
  assistantTextRows: readonly AssistantTextRow[];
  latestAssistantTextRow?: AssistantTextRow;
  workspacePath: string;
  workspaceHomePath?: string;
  compactForRemoteControl?: boolean;
  changedFilePaths?: readonly string[];
}

const EMPTY_CHANGED_FILE_PATHS: readonly string[] = [];

function joinAssistantTurnText(rows: readonly AssistantTextRow[]): string {
  return rows
    .map((row) => row.text)
    .filter((text) => text.trim().length > 0)
    .join("\n\n");
}

export function useAssistantPreviewCardsForAssistantTextRow({
  row,
  assistantTextRows,
  latestAssistantTextRow,
  workspacePath,
  workspaceHomePath,
  compactForRemoteControl,
  changedFilePaths = EMPTY_CHANGED_FILE_PATHS,
}: UseAssistantPreviewCardsForAssistantTextRowParams): AssistantPreviewCard[] {
  const turnText = useMemo(() => joinAssistantTurnText(assistantTextRows), [assistantTextRows]);
  const canBuildCards =
    row !== undefined &&
    latestAssistantTextRow?.rowId === row.rowId &&
    (row.state === "complete" || row.state === "interrupted");
  const fileReferences = useMemo(
    () =>
      canBuildCards
        ? extractAssistantFileReferences(turnText, workspacePath, {
            homePath: workspaceHomePath,
          })
        : [],
    [canBuildCards, turnText, workspaceHomePath, workspacePath],
  );

  return useMemo(
    () =>
      canBuildCards
        ? buildAssistantPreviewCardsFromReferences(turnText, workspacePath, fileReferences, {
            changedFilePaths,
            homePath: workspaceHomePath,
            suppressWebRemoteCards: compactForRemoteControl === true,
          })
        : [],
    [
      canBuildCards,
      changedFilePaths,
      compactForRemoteControl,
      fileReferences,
      turnText,
      workspaceHomePath,
      workspacePath,
    ],
  );
}
