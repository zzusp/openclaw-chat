# openclaw-chat 开发文档

## 项目概述

OpenClaw Chat 是一个 WebSocket 通道插件，用于让 iOS App（或网页客户端）与 OpenClaw/Clawdbot 对话。

## 双构建策略

OpenClaw 与 Clawdbot 使用不同的 `plugin-sdk` 模块路径。本项目采用构建时切换：

```
src/sdk.openclaw.ts   →  静态 import from "openclaw/plugin-sdk"
src/sdk.clawdbot.ts   →  静态 import from "clawdbot/plugin-sdk"
                ↓
        构建脚本复制对应版本到 src/sdk.ts
                ↓
        tsc 编译到临时目录
                ↓
dist/index.openclaw.js   ←  OpenClaw 入口
dist/index.clawdbot.js   ←  Clawdbot 入口
dist/index.js            ←  默认入口 (= openclaw)
dist/src/sdk.openclaw.js ←  OpenClaw SDK
dist/src/sdk.clawdbot.js ←  Clawdbot SDK
dist/src/sdk.js          ←  默认 SDK (= openclaw)
```

## 构建命令

```bash
npm run build
npm run build:openclaw
npm run build:clawdbot
npm run clean
```

## 主要配置

配置路径：`channels.openclawChat`

推荐字段：
- `host`（默认 0.0.0.0）
- `port`（默认 8787）
- `path`（默认 /openclaw-chat）
- `authToken`（可选，强烈推荐）

## 本地测试

使用 `test/ws-client.html` 打开浏览器即可模拟 iOS App。
