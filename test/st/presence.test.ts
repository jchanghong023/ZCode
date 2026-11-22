import { isIP } from "node:net";
import { describe, expect, it } from "vitest";
import type { AIReqPresenceSnapshot } from "@zcode/services/aireq";
import { connectST, type STClient } from "./client.js";

describe("online people through real connection lifecycle", () => {
  it("pushes unique employees and source IPs, retaining other tabs when one closes", async () => {
    const observer = await connectST();
    const clients: STClient[] = [];
    const events: AIReqPresenceSnapshot[] = [];
    const subscription = observer.services.aiReqService.onDidChange((event) => {
      if (event.type === "presence") events.push(event.snapshot);
    });
    const suffix = String(Math.floor(Math.random() * 100_000_000)).padStart(8, "0");
    const firstId = `p${suffix}`;
    const secondId = `q${suffix}`;
    try {
      expect(await observer.call("readPresence", [])).not.toHaveProperty("employeeCount");
      const first = await connectST(firstId);
      clients.push(first);
      await expect
        .poll(() => events.at(-1)?.rows.some((row) => row.employeeId === firstId))
        .toBe(true);
      const firstSnapshot = await observer.call("readPresence", []);
      const firstRows = firstSnapshot.rows.filter((row) => row.employeeId === firstId);
      expect(firstRows).toHaveLength(1);
      expect(isIP(firstRows[0]!.ip ?? "")).toBeGreaterThan(0);

      const duplicate = await connectST(firstId);
      clients.push(duplicate);
      const duplicateSnapshot = await observer.call("readPresence", []);
      expect(duplicateSnapshot.rows.filter((row) => row.employeeId === firstId)).toEqual(firstRows);

      const second = await connectST(secondId);
      clients.push(second);
      await expect
        .poll(() => events.at(-1)?.rows.map((row) => row.employeeId))
        .toEqual(expect.arrayContaining([firstId, secondId]));
      await first.close();
      expect(
        (await observer.call("readPresence", [])).rows.filter((row) => row.employeeId === firstId),
      ).toEqual(firstRows);
      await duplicate.close();
      await expect
        .poll(async () =>
          (await observer.call("readPresence", [])).rows.some((row) => row.employeeId === firstId),
        )
        .toBe(false);
      await second.close();
      await expect
        .poll(() =>
          events.at(-1)?.rows.some((row) => row.employeeId === firstId || row.employeeId === secondId),
        )
        .toBe(false);
      expect(
        events.every((event, index) => index === 0 || event.revision > events[index - 1]!.revision),
      ).toBe(true);
    } finally {
      subscription.dispose();
      await Promise.allSettled(clients.map((client) => client.close()));
      await observer.close();
    }
  });
});
