# 服务器接入指南

## 推荐边界

前端已经通过 `GameTransport` 隔离本地牌局与远程牌局。服务器开发者需要实现 WebSocket 端点，并遵守 `docs/WEBSOCKET_PROTOCOL.md`。

竞技与下注规则必须遵守 `docs/TOURNAMENT_RULES.md`。Node.js＋TypeScript 服务端优先直接复用共享规则引擎，避免客户端与服务端出现规则分叉。

前端接入只需要在构建环境中设置：

```text
VITE_WS_URL=wss://your-domain.example/ws
```

重新构建后，大厅中的“朋友联机”入口会自动启用。

## TypeScript 服务端

Node.js＋TypeScript 服务端可以直接复用：

- `@river-noir/poker-engine`：权威规则引擎。
- `@river-noir/protocol`：消息类型和玩家视角投影。
- `@river-noir/poker-ai`：可选 AI 补位逻辑。

服务端不应复用浏览器中的 `LocalGameTransport`。该类只用于本地训练。

推荐的房间内存结构：

```ts
interface ServerRoom {
  roomId: string;
  roomCode: string;
  state: GameState;
  connectionsByPlayerId: Map<string, WebSocket>;
  processedActionIds: Map<string, CommandResult>;
  actionTimer: NodeJS.Timeout | null;
}
```

每次状态变化后，对每名玩家分别调用 `projectGameView(state, playerId, options)`，再发送其专属快照。

## 其他语言服务端

使用 Go、Rust、Java、C# 或其他语言时，可以重新实现规则引擎。至少需要用本项目测试数据验证：

- 全部牌型和踢脚比较。
- A－2－3－4－5 小顺子。
- Heads-up 盲注与行动顺序。
- 最小加注和短码 All-in。
- 未完整加注不重新开放加注权。
- 多次短码 All-in 累计达到完整加注时重新开放加注权。
- 主池和多层边池。
- 平分底池与零散筹码。
- 未跟注筹码退回。
- 零筹码玩家淘汰且后续不再发牌；只剩一名有筹码玩家时整场结束。
- 每手牌筹码守恒。

## 服务端职责

- 房间和座位管理。
- 连接身份、重连令牌和在线状态。
- 密码学安全洗牌与发牌。
- 权威行动计时。
- 命令合法性和幂等性。
- 状态版本控制。
- 主池、边池和结算。
- 分玩家私人快照。
- 持久化、监控和审计日志。

## 前端职责

- 房间设置与加入界面。
- 玩家操作输入。
- 牌桌、动画、声音和双语显示。
- 断线和重连状态显示。
- 根据服务端 `legalActions` 渲染按钮。
- 训练模式胜率分析。

朋友房默认关闭实时胜率分析。若以后加入复盘功能，建议在一手结束后通过独立复盘接口获取各街胜率。
