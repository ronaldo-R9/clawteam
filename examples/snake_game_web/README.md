# Online Multiplayer Snake Game

一个包含登录和注册系统的在线多人贪吃蛇游戏。

## 功能
- 用户注册和登录
- 实时多人在线PK（支持两人同时在线）
- 自动记录分数和历史结果
- 排行榜展示前10名最高分

## 技术栈
- **前端**: React, TypeScript, Vite, Socket.io-client, Axios, React Router
- **后端**: Node.js, Express, Socket.io, SQLite3, JWT, bcryptjs
- **样式**: Vanilla CSS

## 如何运行

### 1. 安装依赖
在根目录下运行：
```bash
# 安装后端依赖
cd server
npm install

# 安装前端依赖
cd ../client
npm install
```

### 2. 启动服务
建议在两个不同的终端中运行：

**启动后端:**
```bash
cd server
npm run dev
```

**启动前端:**
```bash
cd client
npm run dev
```

### 3. 访问游戏
打开浏览器访问 `http://localhost:5173`。

## 游戏规则
- 使用方向键控制蛇的移动。
- 吃到红色食物可以增加10分并增加蛇的长度。
- 撞到墙壁、自己或其他玩家的身体会导致游戏结束。
- 游戏结束后分数会自动保存并更新排行榜。
