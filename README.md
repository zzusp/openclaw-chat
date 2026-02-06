# openclaw-chat

OpenClaw Chat channel plugin — WebSocket bridge for an iOS app (or web client) to chat with OpenClaw/Clawdbot.

## One-Click Install

### OpenClaw

Copy this message to OpenClaw (replace the repo URL if needed):

```
帮我安装 OpenClaw Chat 插件: https://example.com/openclaw-chat
```

### Clawdbot

```
帮我安装 OpenClaw Chat 插件: https://example.com/openclaw-chat
```

## Manual Install

### OpenClaw

```bash
openclaw plugins install openclaw-chat
openclaw config set channels.openclawChat.enabled true --json
openclaw config set channels.openclawChat.host "0.0.0.0"
openclaw config set channels.openclawChat.port 8787
openclaw config set channels.openclawChat.path "/openclaw-chat"
openclaw config set channels.openclawChat.authToken "your-token"
openclaw gateway restart
```

### Clawdbot

```bash
clawdbot plugins install openclaw-chat
clawdbot config set channels.openclawChat.enabled true --json
clawdbot config set channels.openclawChat.host "0.0.0.0"
clawdbot config set channels.openclawChat.port 8787
clawdbot config set channels.openclawChat.path "/openclaw-chat"
clawdbot config set channels.openclawChat.authToken "your-token"
clawdbot gateway restart
```

## WebSocket Protocol (Client → Server)

The iOS app (or web client) connects to:

```
ws://<host>:<port>/openclaw-chat?token=<authToken>&clientId=<clientId>
```

You can also send a `hello` message after connecting:

```json
{ "type": "hello", "clientId": "ios-user-001", "token": "your-token" }
```

Send a message:

```json
{ "type": "message", "text": "你好", "clientId": "ios-user-001" }
```

The server replies:

```json
{ "type": "message", "from": "openclaw", "to": "ios-user-001", "text": "..." }
```

## Test Page (Simulate iOS App)

Open `test/ws-client.html` in a browser and connect to your local gateway.  
It supports setting host/port/path/token/clientId and sending messages.

## Security Notes

- Use `authToken` in production to prevent unauthorized connections.
- Use `dmPolicy` + `allowFrom` to restrict who can chat.

## License

MIT
