# 对话遥测计算

shared 提供遥测 builder、事件形状、模型身份投影与 live fact 归集算法；通过注入 reporter 输出，不依赖 UI、文件或网络。归集器实例持有自身有界状态，不接纳或重排业务输入。

输入来源随命令固定，snapshot/replay 不补报用户动作。保留算法不表示当前产品装配桌面 supervisor 或动态遥测订阅服务。浏览器遥测接收边界见 `packages/web/src/platform/CONTRACT.md`。
