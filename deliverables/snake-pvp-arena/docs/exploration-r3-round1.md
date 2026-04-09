# 第 1 轮探索

> 团队: snake-pvp-run3-attempt-001
> 探索者: explorer
> 基于对当前代码库的完整审查：server 层已基本完成（Express + Socket.IO + JWT + FileDatabase + 完整游戏引擎），client 层骨架已搭建（React 19 + Vite + TailwindCSS v4 + react-router-dom v7 + socket.io-client），但 5 个页面组件中仅完成 LoginPage，GamePage / LobbyPage / RegisterPage / StatsPage 均缺失。

---

## 保守方案：补齐 React 前端四个页面，不动后端一行代码

### approach
- 逐个实现缺失页面：`RegisterPage`（复用 LoginPage 结构）→ `LobbyPage`（创建/加入房间）→ `GamePage`（Canvas 渲染 + Socket.IO 驱动）→ `StatsPage`（个人战绩 + 近期对局）
- 游戏画面用 `<canvas>` + `requestAnimationFrame`，每次 `room:update` 事件重绘整个 24×24 网格
- 房间管理通过已有的 `room:create` / `room:join` Socket 事件实现
- 操控通过键盘方向键 → `direction:set` 事件
- TailwindCSS v4 已配置好，UI 直接用 utility class 搭建

### why it works
- 后端已经过两轮迭代验证（认证、房间管理、游戏循环、碰撞检测、断线处理、战绩记录全部完成），零改动风险最低
- 前端只是"接线"工作 —— 把已有的 Socket 事件和 REST API 连到 UI 上
- 可用的 hook `useSocket` 已封装好 Socket.IO 连接管理
- 24×24 网格 + 150ms tick 极其轻量，Canvas 渲染无性能压力
- 最快达到"全功能可运行"状态

### downside
- 没有自动匹配 —— 两个用户必须在线下或通过其他渠道交换房间码才能对战
- 没有移动端触控支持 —— 仅键盘操控
- 视觉上是最基础的色块方格，没有动画过渡，没有视觉反馈（吃食物、碰撞死亡都是瞬间切换状态）
- 仅有 `stats/me` 端点，无全服排行榜

---

## 激进方案：自动匹配 + Canvas 动效 + 移动端触控 + 排行榜

### approach
- **自动匹配队列**：新增服务端内存队列（无需 Redis）。用户点击"快速匹配" → `matchmaking:enqueue` → 服务端配对 → 自动创建房间并推送双方进入 GamePage。队列超时 30 秒后提示无对手。
- **Canvas 动效系统**：
  - 蛇身带渐变色（头亮尾暗）
  - 吃食物时粒子爆发（8-12 个小方块向外扩散，0.3 秒衰减）
  - 死亡时蛇身逐格碎裂动画
  - 食物呼吸灯效果（脉冲缩放）
- **移动端触控**：滑动手势检测（touchstart → touchend 的向量方向 → direction:set），解决手机可玩性
- **全服排行榜**：新增 `GET /api/leaderboard` 端点，返回 top 20 玩家（按胜率排序），前端新增排行榜面板
- **断线重连窗口**：利用已有的 `room:watch` 事件，给断线玩家 10 秒重连机会，而非立即判负

### why it could outperform
- 自动匹配是**用户体验的分水岭** —— "打开网页就能玩"vs"找到朋友才能玩"是完全不同的产品
- 动效不改变游戏逻辑但能让"24×24 色块"变成"看起来精致的小游戏"
- 触控支持让手机用户能玩，潜在用户群翻倍
- 排行榜给了用户回来的动机
- 断线重连减少了"网络抖动 → 对局作废"的挫败感

### downside
- 开发量约为保守方案的 2.5-3 倍
- 自动匹配需要新增 3 个 Socket 事件和服务端队列逻辑，是唯一需要改动后端的方案
- 粒子系统需要在 `requestAnimationFrame` 循环中额外管理动画状态，与 React 状态管理有潜在冲突
- 触控手势在小屏幕上可能误触

---

## 奇特但可行方案：WebGL 像素着色器渲染 + 房间观战直播 + 击杀回放

### approach
- **WebGL 像素着色器**：不用 Canvas 2D，改用 WebGL + fragment shader 渲染整个网格。每个格子是着色器中的一个像素。蛇身用正弦波做光晕效果，食物用 noise 函数做星光闪烁。整个渲染层只需一个全屏四边形 + 一张 24×24 的数据纹理。
- **任何人可观战**：新增公开房间列表 `GET /api/rooms/active`，已登录用户可以选择任何正在进行的对局进入观战模式。观战者通过独立的 Socket.IO room 接收状态，不影响对战双方。
- **击杀回放**：服务端在 RoomRuntime 中记录每个 tick 的完整快照（24×24 网格 + 蛇位置很小，50 个 tick 约 20KB）。对局结束后，客户端可以拖动时间轴回放整场对局，看到致命碰撞如何发生。
- **前端零框架降级**：如果团队觉得 React 19 增加了不必要的复杂度，可以考虑用 Preact（3KB）作为 drop-in 替换，或者直接用 vanilla JS + Web Components。对于一个 5 页面、核心交互在 Canvas/WebGL 的应用，React 的虚拟 DOM diffing 几乎没有用武之地。

### why it might unlock a better outcome
- WebGL 着色器渲染让"贪吃蛇"看起来像一个赛博朋克风格的游戏，**视觉差异化**极强。关键是实现成本被高估了——24×24 网格的着色器极其简单，核心代码约 80 行 GLSL
- 观战系统把游戏从"两个人关起门来玩"变成"有观众的竞技"，社交杠杆效应大
- 击杀回放是小成本大效果——服务端只需要存 50 个 tick 的数组，客户端只需要一个 slider + setInterval 回放，但用户体验提升非线性
- Preact 替换 React 可以将前端 bundle 从 ~140KB 降到 ~15KB，首屏加载提速 10 倍

### downside
- WebGL 在某些老旧移动浏览器上有兼容性问题（需要 Canvas 2D fallback）
- GLSL 调试困难，视觉效果的迭代速度比 Canvas 2D 慢
- 观战系统增加了服务端的连接数管理复杂度
- 击杀回放的 tick 快照存储如果不清理会消耗内存
- 从 React 切换到 Preact/vanilla 有迁移成本（虽然当前前端代码量极小，但 AuthContext 等已写好的代码需要适配）

---

## 需要挑战的假设

1. **"后端完全不需要改动"** — 保守方案的前提是后端够用。但仔细看，`FileDatabase` 的 `persist()` 每次写全量 JSON，match 记录硬编码上限 50 条（`storage.ts:98`）。如果目标是"持久化比分和对局结果"，50 条记录上限意味着早期对局记录会被无声丢弃。这不算"持久化追踪"。至少应该去掉这个上限或改用 append-only 日志。

2. **"房间码模式满足'实时在线双人 PvP'的需求"** — 需求说的是"real-time online two-player PvP matches"。如果两个陌生人打开网站，没有自动匹配，他们就无法 PvP。房间码只解决了"认识的两个人"的场景。**自动匹配不是增强功能，是达标需求。**

3. **"React 19 是前端的最佳选择"** — 当前客户端代码量极小（AuthContext + LoginPage + useSocket + App = ~200 行）。React 19 的 bundle 成本约 140KB gzipped，但这个应用的核心交互是 Canvas/WebGL 渲染，React 管理的 UI 只有几个表单和按钮。React 的价值在 DOM 密集型应用，不在游戏渲染。不过考虑到 **Vite + React + TailwindCSS 已经配置完毕**，切换的迁移成本可能不值得。

4. **"150ms tick 间隔是合适的"** — 150ms 在低延迟局域网环境没问题，但在公网 WiFi（RTT 50-100ms）下，从按键到看到蛇移动的感知延迟可能达到 200-250ms。对于贪吃蛇这种"差一格就死"的游戏，这个延迟会导致挫败感。客户端预测（按键后立即本地移动，服务端 tick 校正）可以将感知延迟降到 0。

5. **"游戏只需要蛇和食物"** — 当前地图是完全空白的 24×24 网格。两条蛇在空地上对战，高水平玩家会发展出固定的生存策略（靠墙走、追尾），对局会变得重复和无聊。**地图障碍物**（每局随机 5-8 个不可穿越方块）几乎零成本就能大幅增加策略深度。

---

## 推荐方向

**以保守方案为主干，必须加入自动匹配，强烈建议加入动效和触控支持。**

优先级排序：

1. **P0 — 补齐四个页面**（RegisterPage / LobbyPage / GamePage / StatsPage）：这是到达"可运行"的最短路径。后端不动。
2. **P0 — 自动匹配队列**：在 LobbyPage 加一个"快速匹配"按钮，服务端新增内存队列。不需要 ELO，不需要 Redis，纯内存 Map + setTimeout 即可。这是从"demo"到"产品"的关键跃迁，也是需求达标项。
3. **P1 — 移动端触控**：`touchstart` / `touchend` 检测滑动方向 → `direction:set`。代码量 < 30 行，但让手机用户能玩。
4. **P1 — Canvas 渐变 + 简单动效**：蛇身渐变色 + 食物脉冲动画。不需要粒子系统，不需要 WebGL，在 Canvas 2D 里用渐变和透明度即可。投入产出比极高。
5. **P2 — match 记录上限修复**：把 `storage.ts:98` 的 `slice(0, 50)` 改大或去掉。
6. **P2 — 排行榜端点**：新增 `GET /api/leaderboard`，StatsPage 展示全服 top 20。

**不建议在本轮引入**：WebGL 着色器、观战系统、击杀回放、ELO、回合制变体、框架替换。这些投入大、验证周期长，在 4 轮迭代内难以做到高质量交付。

**一句话**：后端已经走到 80%，前端是 20%。最大杠杆在于快速补齐前端 + 加入自动匹配。不要在架构上冒险，在用户体验上投入。
