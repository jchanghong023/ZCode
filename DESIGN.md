# ZCode Design System

## Overview

AIReq 使用当前 ZCode 界面体系：安静、紧凑、可长时间操作的电脑浏览器工作台。优先保证表格、阅读、会话及多面板操作一致，不采用营销式留白或整页品牌填色；动效仅在所选主题的明确边界内启用。手机布局、触摸专用适配及原生窗口控制不属于当前产品界面。

实际 token 由 `packages/ui/src/styles.css` 定义，基础控件由 `packages/ui/src/components/ui/` 提供；本文说明角色与用法，不复制另一份颜色值。当前源码是几何和控件行为依据，不依赖旧上游截图或已删除补丁规格。

## Colors

主题选择为系统、浅色、深色和动效；浅／深使用 Zai Light／Zai Dark，动效使用 `zai-motion`。基础 light／dark 变量保留作底层定义。业务界面复用语义 token，不引入独立主题状态或页面专属灰色。

动效主题复用 Zai Dark 的全部配色、布局与文字，每次启动默认启用；主题本地记忆暂时停用，既有存储不读取也不改写。当前会话仍可切换主题，系统跟随仍使用原浅／深主题。仅该主题提供 240px 局部柔光（指针更新最多 20Hz）、导航滑动高亮和有限次按下反馈；不加空闲循环、全屏渐变重绘、模糊、Canvas 或 WebGL。减少动态效果与性能模式停用这些效果。具体边界见 [默认动效主题](docs/specs/aireq-migration/motion-theme.md)。

| 角色           | token                                                                                  |
| -------------- | -------------------------------------------------------------------------------------- |
| 页面与结构     | `background`、`background-alt`、`background-win-alt`、`header`、`panel`、`sidebar`     |
| 卡片与普通表面 | `card`、`card-selected`、`card-border`、`surface`、`surface-hover`                     |
| 菜单与浮层     | `menu`、`menu-hover`、`popover`、`popover-border`、`tooltip`、`tooltip-foreground`     |
| 输入           | `input`、`input-focused`、`input-border`、`input-border-hover`、`input-border-focused` |
| 文字           | `foreground`、`foreground-subtle`、`foreground-subtlest`、`foreground-inverse`         |
| 操作与选择     | `primary`／`primary-foreground`、`secondary`、`hover`、`selected`、`brand`、`accent`   |
| 状态           | `success`、`warning`、`destructive` 及各自 foreground／surface                         |
| 更新中         | `progress-surface`／`progress-surface-foreground`                                      |
| Diff           | `diff-added`／`diff-added-foreground`、`diff-removed`／`diff-removed-foreground`       |

业务表格、项目数据及设置行使用卡片底色与边框，粘性表头保持不透明。标题、主要数值及想法池的原始需求用主文字，提案标题下的原文摘要、工号、编号、日期及说明用次级文字；侧栏辅助文字使用 `remote-foreground-muted`。辅助文字在所属卡片和页面表面保持可读对比，不靠缩小字号制造层级。抬升表面（卡片内层面板、行悬停底色）会吃掉对比余量：其上的次级文字按实际合成底色核验 ≥4.5:1，不足时升为主文字或调整表面，不沿用外层卡片的通过结论。

状态色只表达真实状态，不作装饰；surface 与对应 foreground 配对。等待确认使用 interaction-confirmation，不借 success 表示等待。Git 文件状态使用 `git-*`，不借 Diff 或 warning。文件、Skill、命令 mention 使用各自 node 的背景、hover 和前景；Markdown 行内代码使用 `markdown-inline-code`。

Lucide 次级／三级前景沿既有颜色适配整体混合，避免路径交叉变深；不全局改写其他 SVG。交互颜色、显式子颜色和额外 opacity 保持现有覆盖关系。

## Typography

普通 UI 使用默认 `font-sans`；路径、命令、标识符、快捷键和代码使用 `font-mono`。应用 UI 使用 `text-ui-*`，不增加 Tailwind 内建 `text-base/sm/xs`、任意字号或内联 UI 字号。

`--ui-font-size` 默认 14px，界面字号设置只更新该变量，不改变 html 字号；图标、间距、圆角等 rem 几何不随字体缩放。

| token             | 相对界面字号 | 默认 | 用途                           |
| ----------------- | ------------ | ---- | ------------------------------ |
| `text-ui-xl`      | +4px         | 18px | 一级阅读标题                   |
| `text-ui-lg`      | +2px         | 16px | 二级阅读标题、独立文档正文     |
| `text-ui-base`    | 不变         | 14px | 普通 UI、按钮、正文            |
| `text-ui-caption` | -1px         | 13px | 明确的紧凑辅助说明             |
| `text-ui-sm`      | -2px         | 12px | 次级说明、Tooltip、行内代码    |
| `text-ui-xs`      | -4px         | 10px | 徽标、数量和弱元信息           |
| `text-ui-2xs`     | -5px         | 9px  | 保留图表刻度／单位，不用于正文 |

AIReq 主页与设置 h1 共用 `text-ui-settings-title lg:text-ui-settings-title-lg font-semibold tracking-tight`，界面字号 +10px／+16px，默认 24px／30px。`text-ui-page-title` 保留为其他组件独立角色，不替代 AIReq 当前标题常量。

聊天正文使用 base；Markdown h1／h2 使用 xl／lg，h3–h6 使用 base 并以字重分层。独立 UIW 只读文档正文使用 lg 与库的相对标题比例。代码、Diff 和终端内容使用独立阅读字号，外侧控制仍使用 UI token。

标题和标签通常使用 medium／semibold；Tooltip 普通文字用 sm，快捷键用 xs。长翻译和技术值可换行或在明确区域截断，不依赖只适配短英文的固定布局。

`text-ui-xs`／`text-ui-2xs` 的徽标、数量与弱元信息是设计许可的小字号角色；设计检测器按 11px 通用下限对这类命中报警时，按本表角色豁免，不据此放大正文或徽标，也不把豁免扩展到承载说明或操作的小字。

## Layout

工作台采用 256px 展开侧栏、主区及唯一右侧可调宽工作区。设置使用同宽侧栏和浏览器全页覆盖层，不叠加第二套导航或原生标题栏。右侧多对象、多种类 Tab 的行为见 [统一右侧工作区](docs/specs/aireq-migration/unified-side-pane.md)。

主页与设置正文复用 `SETTINGS_FRAME_CONTENT_CLASSNAME`，在实际剩余面板内居中，`max-w-4xl px-4 lg:px-8`。正文限宽与外层滚动分离，使用稳定双侧滚动槽。右侧展开后聊天、输入器、身份和阶段区域随主区收窄，不按整个浏览器计算偏移。列表与设置共享顶部基线，无概览来源的提案讨论详情不保留列表顶部占位。

从当前项目进入的目标页在内容区顶部显示 `← 返回当前项目`，复用现有 48px 留白、正文宽度与双侧滚动槽，保持列表标题和正文起点不动。使用 ghost 按钮、次级文字及既有可见焦点，返回图标与正文左边缘对齐。侧栏直达不显示；普通讨论不增加空占位，仅有概览来源时显示上下文返回带；右侧详情不重复增加返回。

项目分组铺满阅读列，版本摘要按所属面板宽度由一列变为两列，展开不改变分组外宽。按钮组可换行，表格局部横滚，不撑开整个页面。侧栏范围区固定在导航滚动区之外；主区容器不足 640px 时业务表格进入紧凑呈现（次级列并入行内摘要或展开详情），不缩小字号。

常用间距基于 4px 节奏：4px 图标间隙、8px 紧凑控件、12px 列表、16px 卡片内边距、20–24px 较大分组。组间距大于组内距。嵌套 flex／滚动区域按需使用 `min-w-0`、`min-h-0`。优先流体宽度和 max-width，固定宽度用于菜单、对话框及稳定侧栏，不新增业务页面几何体系。

电脑窗口缩放时保持组件语义和主操作可达，以 grid、flex、宽度和可见性调整密度。保留的 compact-web 或 mobile-input-safe 兼容样式不构成手机交付要求。

## Elevation & Depth

层次主要由背景、边框和留白表达，普通布局不依赖大柔影。卡片低于浮层，菜单使用 menu，对话框使用 popover，不将菜单画成堆叠卡片。菜单保留原有 shadow，键盘聚焦不能清除其阴影。

交互浮层高于被动 Tooltip，Tooltip 不遮挡已打开菜单选项。Toast 使用共享定位、`bg-toast/60`、背景模糊及现有圆角外壳，调用方不添加独立偏移。

动效快速、克制，仅解释状态变化。总览新增版本淡入、展开箭头旋转及进度条过渡沿现有实现；数字和可访问状态即时更新，不制造初始进度。不用浮起、缩放或滚动数字模拟活跃；减少动态效果时直接呈现最终状态。

动效主题下，总览项目分组以边框渐亮回应悬停，版本卡片以边框和底色过渡聚焦阅读，进入 200ms、退出 120ms。只读语义保持不变，不使用手形、位移或进入箭头；减少动态效果与性能模式停用此反馈。

## Shapes

复用当前组件及容器圆角，不以重要性发明新半径。业务外层卡片常用 `rounded-xl`，内层版本卡片用 `rounded-lg`；布局包装本身不建立新圆角层级。

共享 Button 当前默认 `rounded-md`，xs／icon-xs 使用 `rounded-sm`，lg／icon-md／icon-lg 使用 `rounded-lg`。保留实际 variant，不以文档全局更改控件几何。对话框、菜单、输入器及预览外壳使用各自现有基础组件；普通卡片不借聊天输入器或 Toast 的大圆角。

`rounded-full` 仅用于明确的圆或胶囊，不因是图标按钮、计数或标签便自动使用。连接表面按现有样式移除相邻圆角，不添加任意像素半径。

外层 `rounded-xl` 卡片内嵌 `rounded-lg` 版本卡片是总览的许可模式，检测器 nested-cards 命中按此豁免；豁免仅限该既有嵌套，不作为新增嵌套卡片的依据。内层抬升表面的文字对比仍按 Colors 一节核验。

## Components

### Buttons and inputs

复用 Button variants：default、outline、secondary、ghost、destructive、warning、link。default 使用 primary 配对色；危险和警告只用于对应业务动作。尺寸为 default h-7、xs h-5、sm h-6、lg h-8，图标按钮使用现有 icon variants，不另设宽高体系。图标通常 size-4，细节按组件 variant 缩放。

输入使用 input 背景及边框，hover／focus 使用对应 token，不默认发光。占位符与 Select 未选值使用 `foreground-subtle`，在输入表面保持 ≥4.5:1；`foreground-subtlest` 只用于弱元信息，不承载字段说明。标签、错误和辅助信息与控件关联；保存中保留文本控件挂载且只读，不因 disabled 移走输入焦点。错误使用真实错误语义，不将普通说明标红。

键盘焦点必须可见：全局仅清除系统默认 outline 与 focus ring 阴影，不整体禁用组件焦点样式；焦点表达由组件自有 border／ring token 承担。Button 各 variant 在 focus-visible 提供可见焦点边框（危险／警告沿各自状态色），输入与选择器沿 input-border-focused；强制颜色模式保留系统 Highlight outline。新增控件不得依赖被全局清除的默认描边，也不在组合输入上叠加第二套全局 outline。

### Navigation and tabs

导航行共用图标、名称及可选右对齐范围提示，选中使用 selected 和较强字重，键盘焦点独立可见，悬停不转移当前位置。品牌中英文两行始终存在，Logo 为装饰图像。

Tab 使用紧凑外观及 active／inactive 对比，不用品牌整块填色；Tab 与 panel 保持语义关联。内容 Tab 可见标题带短种类前缀，前缀不随对象名截断。关闭、排序（指针拖动或右键左移／右移）、折叠及完整视图复用统一框架，不为业务详情创建第二套壳。

### Menus and overlays

菜单使用紧凑 action rows、menu-hover 及共享 option-stack 的 2px 间距，保留禁用项位置。相同动作集在三点菜单与右键入口复用，选中使用现有勾选／radio，不给每行增加按钮外壳或边框。Popover 与 Dialog 复用基础组件。

主操作＋下拉触发器使用现有分段结构，Select trigger 保留输入语义，展开项沿菜单样式。浮层根据触发器及可用边界定位，保持紧凑偏移和稳定焦点返回。

### Reading and status

Markdown 表格、代码、Mermaid、图片与依赖图复用共享阅读器，材料导出策略见 [只读材料](docs/specs/aireq-migration/document-surface.md)。状态同时有可读文字，不只靠颜色；loading、失败、真正空数据及过期不能互相替代。

## Do's and Don'ts

- 复用语义 token、共享组件、既有组件级焦点样式及国际化文本；全局层只清系统默认 outline／ring 阴影，不添加全局强制 outline，也不整体禁用组件焦点样式。
- 保持深浅主题的卡片、文字和浮层层次一致，容纳长名称和翻译。
- 将重复说明放入现有帮助或 disclosure，保留异常、门禁及完成任务必需的操作。
- 不新增手机或原生桌面交付规则，不恢复隐藏 Skill、插件或其他裁撤产品入口。
- 不从保留模块、兼容 CSS 或通用组件推断当前可见能力。
