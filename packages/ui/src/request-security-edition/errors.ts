export const REQUEST_VERIFICATION_REJECTED_MESSAGE = "";
export function resolveRequestVerificationBusinessCode(
  _code: string | undefined,
  _message: string | undefined,
): "3007" | undefined {
  return undefined;
}
export function isRequestVerificationTerminalError(
  _error: { code?: string; message?: string } | null | undefined,
): boolean {
  return false;
}
export function isRequestVerificationRejectedMessage(_message: string | undefined): boolean {
  return false;
}
export function resolveRequestSecurityErrorMessageId(_error: {
  code?: string;
  message?: string;
}): string | undefined {
  return undefined;
}
export function isRequestVerificationConfigNetworkError(
  _error: { code?: string; message?: string } | null | undefined,
): boolean {
  return false;
}
