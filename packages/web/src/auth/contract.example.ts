import type { EmployeeEntryContract } from "./contract.js";

export function enterEmployee(owner: EmployeeEntryContract): void {
  owner.enter("12345");
  owner.leave();
}
