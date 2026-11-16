# 任务分组

Current reachable boundary (2026-11-16): retain only `ITaskGroupService.admit`, used by native conversation creation. Retire the old sidebar's `read`, `save`, `ungroup` and `move` RPC methods and their consumers. Pure group DTOs remain for presentation; there is no replacement group store or compatibility service.

The owning backend validates task existence and canonical workspace identity before first admission. Admission does not copy conversation facts or overwrite existing organization. Cancelling a browser subscription never clears shared owner state.
