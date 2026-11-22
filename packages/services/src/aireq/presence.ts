/** Current connection facts; employee numbers are self-reported identities, not authentication. */
export interface AIReqPresenceRow {
  employeeId: string;
  ip: string | null;
}

export interface AIReqPresenceSnapshot {
  revision: number;
  rows: AIReqPresenceRow[];
}
