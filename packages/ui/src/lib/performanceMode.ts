import { readSafeLocalStorage } from "./browserEnvironment.js";

export const PERFORMANCE_MODE_STORAGE_KEY = "zcode-performance-mode";

export function loadPerformanceMode(): boolean {
  return readSafeLocalStorage(PERFORMANCE_MODE_STORAGE_KEY) === "true";
}
