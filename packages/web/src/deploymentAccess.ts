export function deploymentToken(): string | null {
  return new URLSearchParams(globalThis.location?.search).get("token");
}

export function deploymentAuthHeaders(target: string): Record<string, string> {
  const location = globalThis.location;
  if (!location?.origin || new URL(target, location.origin).origin !== location.origin) return {};
  const token = deploymentToken();
  return token ? { Authorization: "Bearer " + token } : {};
}
