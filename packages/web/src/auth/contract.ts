export interface EmployeeEntryContract {
  /** 当前标签页自报工号；不是认证信息，不发送至共享业务服务。 */
  readonly employeeNumber: string | null;
  readonly persistenceError: string | null;
  enter(employeeNumber: string): void;
  leave(): void;
  subscribe(listener: () => void): () => void;
}
