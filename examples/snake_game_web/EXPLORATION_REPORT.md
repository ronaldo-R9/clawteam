# Snake Game Web 项目规划 (Explorer Round 1)

## 核心任务
设计一个具备登录/注册系统、支持双人实时 PK 且记录分数的贪吃蛇网站。

## 方案探索总结

### 1. 保守方案 (Stable & Fast)
- **技术栈**: React + Node.js + Socket.io + MongoDB
- **特点**: 标准全栈架构，开发周期短。

### 2. 激进方案 (Competitive & High Performance)
- **技术栈**: React/PixiJS + Go/Rust + WebSocket + ELO Ranking System
- **特点**: 极致性能，引入“技能系统”和“视觉特效”，增强竞技深度。

### 3. 奇特方案 (Creative & Strategic)
- **概念**: “异步逻辑对战”或“DOM 元素吞噬者”。
- **特点**: 规避延迟问题，通过差异化体验吸引特定用户。

## 待讨论挑战
- 游戏是实时还是异步？
- 分数是否具备“进化/购买”功能？
- 登录是否可以支持第三方/匿名 ID？
