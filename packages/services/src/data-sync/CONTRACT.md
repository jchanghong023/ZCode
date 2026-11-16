# data-sync-service

Current reachable boundary (2026-11-16): retain only `IDataSyncCategoryService<TPayload>` as the generic category shape used by the preserved MCP service. Retire `IUserConfigSyncService`, `IDeviceSyncStateService`, their descriptors, proxies, registrations and old synchronization UI. This generic shape owns no mutable state and does not publish a user-config or device-state channel.
