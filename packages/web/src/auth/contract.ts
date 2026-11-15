export interface EmployeeEntryContract {
  /** 当前标签页自报工号；不是认证信息，以不可变操作标识随业务请求发送。 */
  readonly employeeNumber: string | null;
  readonly persistenceError: string | null;
  enter(employeeNumber: string): void;
  leave(): void;
  subscribe(listener: () => void): () => void;
}
