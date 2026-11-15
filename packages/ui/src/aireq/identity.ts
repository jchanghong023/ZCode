let employeeId: string | undefined;
export function isEmployeeId(value: string): boolean {
  return /^[a-z][0-9]{8}$/.test(value);
}
/** 唯一登录owner在web入口；此模块只投影当前已固定的连接身份，不另写浏览器存储。 */
export function setEmployeeId(value: string): void {
  if (!isEmployeeId(value)) throw new Error("工号格式不正确");
  employeeId = value;
}
export function getEmployeeId(): string {
  if (!employeeId) throw new Error("尚未初始化AIReq工号");
  return employeeId;
}
