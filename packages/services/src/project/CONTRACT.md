# 当前后端项目服务

Current reachable boundary (2026-11-16): the current backend owns the shared project directory. Retain only `readDirectory`, `readProjects`, `readTree`, `prepareSession` and `resolveSessionDirectories` for native conversation preparation and generic mentions. Browser employee identity does not partition projects; `workspacePath` remains the execution directory and `workspaceIdentity` remains the stable isolation key.

Retire the old project editor, movement, reordering, restoration and project-data deletion RPC methods. AIReq repository settings write through `aiReqService`, not this project service. Pure project/storage DTOs remain available to protected generic controls; no replacement mutable project owner or compatibility proxy is introduced.

Directory reads never launch Agent or change task ownership. Session cwd is fixed at creation; additional directories are resolved from existing project facts, not inferred from browser state. Missing project data or read failures reject rather than silently selecting another workspace. Existing native session/attachment lifecycle remains unchanged.
