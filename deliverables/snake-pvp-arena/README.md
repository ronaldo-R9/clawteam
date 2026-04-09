# Snake PvP Arena

一个独立于当前仓库主逻辑的全栈示例，用最小完整闭环实现：

- 用户注册 / 登录
- 受保护的游戏大厅
- 房间码双人在线贪吃蛇
- 对局内实时比分和对局后结果展示
- 用户历史最佳分数、胜负统计、最近战绩持久化

## 技术方案

- 前端：React + TypeScript + Vite
- 后端：Express + Socket.IO + TypeScript
- 持久化：本地 JSON 文件（避免原生数据库依赖）
- 对战模型：服务端权威 tick，客户端只发送方向输入

## 快速启动

```bash
cd deliverables/snake-pvp-arena
npm run install:all
```

终端 1：

```bash
cd deliverables/snake-pvp-arena
npm run dev:server
```

终端 2：

```bash
cd deliverables/snake-pvp-arena
npm run dev:client
```

默认地址：

- 前端：`http://localhost:5173`
- 后端：`http://localhost:5000`

## 人工烟测

1. 注册两个账号。
2. 账号 A 登录后创建房间，复制房间码。
3. 账号 B 登录后输入房间码加入。
4. 两端进入同一局，使用方向键移动。
5. 任一方死亡后，双方都能看到胜者与分数。
6. 返回大厅后，查看个人最佳分数、胜负统计与最近战绩是否更新。
