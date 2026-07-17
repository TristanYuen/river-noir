# River Noir WebSocket 协议

## 1. 总则

- 当前协议版本：`1`。
- 传输：标准 WebSocket 文本帧。
- 编码：UTF-8 JSON。
- 客户端与服务端消息都使用信封结构。
- 金额全部使用整数虚拟筹码。
- 时间全部使用 Unix 毫秒时间戳。
- 服务端是牌局、计时、筹码、牌堆和结算的唯一权威来源。

```json
{
  "protocolVersion": 1,
  "type": "player.action",
  "requestId": "c94f2d02-4106-4783-bb75-232579e63506",
  "payload": {}
}
```

TypeScript 类型源文件位于 `packages/protocol/src/types.ts`。其他语言服务端应依据本文档和该文件建立等价数据结构。

## 2. 会话

连接成功后，服务端发送：

```json
{
  "protocolVersion": 1,
  "type": "session.ready",
  "requestId": "server-message-id",
  "payload": {
    "playerId": "player-123",
    "reconnectToken": "opaque-single-session-token"
  }
}
```

`reconnectToken` 必须不可预测、可撤销并具有有效期。客户端不得自行解析。

连接意外关闭后，客户端会指数退避重连。新连接收到 `session.ready` 后，客户端重新发送 `room.join`，其中携带此前的房间码、昵称和 `reconnectToken`。服务端校验成功后恢复原玩家 ID、座位和私人快照。令牌失效时返回 `NOT_AUTHORIZED`，客户端再引导玩家正常加入。

## 3. 创建房间

客户端发送 `room.create`：

```json
{
  "protocolVersion": 1,
  "type": "room.create",
  "requestId": "client-message-id",
  "payload": {
    "nickname": "Yuan",
    "settings": {
      "maxPlayers": 6,
      "initialStack": 10000,
      "smallBlind": 50,
      "bigBlind": 100,
      "actionSeconds": 30,
      "allowAiFill": true,
      "aiDifficulty": "standard",
      "analysisMode": "off"
    }
  }
}
```

服务端创建房间、分配玩家和房主身份，然后发送 `game.snapshot`。房间码可以通过快照扩展字段或单独的房间消息返回；正式联调时建议在协议版本 2 增加独立 `room.snapshot`，避免污染牌局快照。

## 4. 加入房间

```json
{
  "protocolVersion": 1,
  "type": "room.join",
  "requestId": "client-message-id",
  "payload": {
    "roomCode": "8K2MPT",
    "nickname": "Mira"
  }
}
```

断线重连时可以额外发送 `reconnectToken`。

## 5. 玩家行动

```json
{
  "protocolVersion": 1,
  "type": "player.action",
  "requestId": "client-message-id",
  "payload": {
    "roomId": "room-123",
    "handId": "room-123-42",
    "expectedVersion": 127,
    "actionId": "unique-action-id",
    "action": "raise",
    "amount": 1200
  }
}
```

- `amount` 表示该下注轮累计投入到的目标值。
- Fold、Check、Call 和 All-in 不要求 `amount`。
- 服务端根据 `expectedVersion` 拒绝旧快照产生的操作。
- 服务端根据 `actionId` 实现幂等；重复提交返回原结果。
- 服务端必须重新计算合法行动，不能信任客户端按钮状态。
- 服务端的下注、All-in、边池、淘汰和整场结束判定必须符合 `docs/TOURNAMENT_RULES.md`。

接受命令后发送：

```json
{
  "protocolVersion": 1,
  "type": "command.accepted",
  "requestId": "server-message-id",
  "payload": {
    "commandRequestId": "client-message-id",
    "version": 128
  }
}
```

随后向每名玩家分别发送针对其身份投影的 `game.snapshot`。

## 6. 玩家视角快照

`game.snapshot.payload.view` 的核心规则：

- `roomCode` 返回可邀请朋友使用的房间码；本地模式为 `null`。
- `canStart` 只对有权开始牌局的房主返回 `true`。
- `players[].cards` 只包含当前查看者的底牌。
- 摊牌时只公开有资格展示的未弃牌玩家底牌。
- 其他玩家的 `cards` 必须是空数组。
- `legalActions` 只对当前查看者且轮到其行动时存在。
- `version` 在每次有效状态变化后递增。
- `actionDeadline` 由服务端生成。
- `recentEvents` 只能包含公开信息。
- `players[].status` 为 `busted` 时，该玩家已淘汰，后续手牌不得为其发牌或收取盲注。
- 一手结算后仅剩一名 `stack > 0` 的玩家时，服务器不得接受 `game.nextHand`，当前快照即为整场最终状态。
- 完整牌堆、烧牌、未公开底牌和服务器随机种子不得出现在快照中。

## 7. 错误

```json
{
  "protocolVersion": 1,
  "type": "error",
  "requestId": "server-message-id",
  "payload": {
    "code": "VERSION_MISMATCH",
    "message": "The game view is out of date.",
    "commandRequestId": "client-message-id",
    "currentVersion": 129
  }
}
```

错误码：

- `BAD_REQUEST`。
- `VERSION_MISMATCH`。
- `ROOM_NOT_FOUND`。
- `ROOM_FULL`。
- `NOT_AUTHORIZED`。
- `NOT_YOUR_TURN`。
- `ILLEGAL_ACTION`。
- `HAND_NOT_RUNNING`。
- `INTERNAL_ERROR`。

## 8. 安全要求

- 使用 `wss://`。
- 对消息体设置大小上限。
- 对连接、建房、入房和行动设置速率限制。
- 昵称需要长度限制与 HTML 转义。
- 所有房间和玩家 ID 使用不可预测标识符。
- 牌堆使用密码学安全随机数和 Fisher－Yates 洗牌。
- 日志不得记录完整牌堆、重连令牌或未公开底牌。
- 每名玩家的快照需要独立投影，禁止向房间广播同一份含私人信息的数据。
