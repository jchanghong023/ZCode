import { useEffect, useRef, useState } from "react";
import { formatUserFacingError } from "@/lib/errorMessage.js";
import { useAIReqDataSource } from "../data-source.js";
import { getEmployeeId } from "../identity.js";
import {
  defaultProposalPreferences,
  readLegacyProposalPreferences,
  type ProposalTablePreferences,
} from "./proposalColumns.js";

export function useProposalTablePreferences(zh: boolean) {
  const source = useAIReqDataSource();
  const legacyKey = `aireq.proposal-columns:${JSON.stringify([source.backend?.id, getEmployeeId()])}`;
  const [preferences, setPreferences] = useState<ProposalTablePreferences>();
  const [error, setError] = useState<{ cause: unknown; operation: "read" | "save" }>();
  const [saving, setSaving] = useState(false);
  const [loadingAttempt, setLoadingAttempt] = useState(0);
  const saveSequence = useRef(0);

  useEffect(() => {
    let active = true;
    void source
      .readProposalTablePreferences()
      .then(async (saved) => {
        if (saved || !active) return saved;
        const legacy = readLegacyProposalPreferences(legacyKey);
        return legacy
          ? source.saveProposalTablePreferences(legacy, true)
          : defaultProposalPreferences;
      })
      .then((saved) => {
        if (active && saved) setPreferences(saved);
      })
      .catch((cause: unknown) => {
        if (active) setError({ cause, operation: "read" });
      });
    return () => {
      active = false;
      saveSequence.current += 1;
    };
  }, [source, legacyKey, loadingAttempt]);

  function save(next: ProposalTablePreferences) {
    const request = ++saveSequence.current;
    setPreferences(next);
    setError(undefined);
    setSaving(true);
    void source
      .saveProposalTablePreferences(next)
      .catch((cause: unknown) => {
        if (request === saveSequence.current) setError({ cause, operation: "save" });
      })
      .finally(() => {
        if (request === saveSequence.current) setSaving(false);
      });
  }

  return {
    preferences: preferences ?? defaultProposalPreferences,
    ready: preferences !== undefined,
    saving,
    error:
      error &&
      formatUserFacingError(
        error.cause,
        error.operation === "read"
          ? zh
            ? "列配置读取失败。"
            : "Could not load columns."
          : zh
            ? "列配置尚未保存。"
            : "Column changes were not saved.",
      ),
    save,
    retry() {
      if (preferences) save(preferences);
      else {
        setError(undefined);
        setLoadingAttempt((attempt) => attempt + 1);
      }
    },
  };
}
