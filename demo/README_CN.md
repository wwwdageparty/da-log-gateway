# 🧪 da-log 演示测试指南（中文）

[English Version](./README.md)

---

## 1️⃣ 概述

这是 **da-log 网关** 的演示环境，一个基于 Cloudflare Workers 的轻量级日志系统，支持以下功能：

- 通过 HTTP 写入日志  
- 从数据库读取日志  
- 通过 **Ably** 进行实时广播  
- 将消息转发到 **Telegram 频道**

> ⚠️ 注意：  
> 出于安全原因，`/systemInit` 接口在演示模式下被禁用。  
> 数据库和通道已预初始化。

---

## 2️⃣ 演示信息

| 类型 | 详情 |
|------|------|
| 🌐 日志网关 URL | `https://demo.dglog.workers.dev/` |
| ✏️ 写入令牌 | `Demo111+` |
| 📖 读取令牌 | `Demo222-` |
| 🔔 Ably 通道 | `dademo` |
| 🔑 Ably 订阅密钥 | `oVDZ0A.ubTYGA:zSVyaT8TFujR-w1s3hbUpPdkgaSXYd6YjKngg4f1-QU` |
| 💬 Telegram 频道 | [私有链接](https://t.me/+3fbwV28BdZ4wNTk1) |

---

## 3️⃣ 如何测试日志写入

使用以下命令发送日志到网关：

```bash
curl -X POST https://demo.dglog.workers.dev/log \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer Demo111+" \
  -d '{
    "service": "demo-service",
    "instance": "instance-1",
    "level": 2,
    "message": "你好，这是一条测试日志！"
  }'
```

✅ 日志将会：
- 写入数据库  
- 广播到 Ably 通道 `dademo`  
- 转发到 Telegram 群组  

---

## 4️⃣ 如何读取日志

使用读取令牌从网关获取日志：

```bash
curl "https://demo.dglog.workers.dev/logs?limit=5" \
  -H "Authorization: Bearer Demo222-"
```

---

## 5️⃣ 实时日志监听（Python 示例）

此 Python 示例连接到 Ably 通道 `dademo`，并实时打印从 Worker 推送的日志。

```python
import asyncio
import json
from ably import AblyRealtime

# ---------- 公共演示密钥 ----------
ABLY_API_KEY = "oVDZ0A.ubTYGA:zSVyaT8TFujR-w1s3hbUpPdkgaSXYd6YjKngg4f1-QU"
ABLY_CHANNEL_NAME = "dademo"

def analyze_log(message):
    '''解析并打印 Ably 推送的日志消息'''
    print(f"\n📨 收到消息，通道: '{getattr(message, 'channel', None)}' 名称: '{getattr(message, 'name', None)}'")
    data = message.data

    if isinstance(data, dict) and "data" in data:
        data = data["data"]

    if isinstance(data, str):
        try:
            data = json.loads(data)
        except json.JSONDecodeError:
            print(f"📝 文本内容: {data}")
            return

    if not isinstance(data, dict):
        print(f"⚠️ 未知数据格式: {data}")
        return

    service = data.get("service", "?")
    instance = data.get("instance", "?")
    level = data.get("level", "?")
    message_text = data.get("message", "(无内容)")

    print("━━━━━━━━━━━━━━━━━━━━━━━━━━")
    print(f"🧩 服务:   {service}")
    print(f"🏷️ 实例:   {instance}")
    print(f"🔢 等级:   {level}")
    print(f"🗒️ 消息:   {message_text}")
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━")

async def main():
    ably = AblyRealtime(ABLY_API_KEY)
    await ably.connection.once_async("connected")
    print("✅ 已连接到 Ably")
    channel = ably.channels.get(ABLY_CHANNEL_NAME)
    await channel.subscribe(analyze_log)
    print(f"👂 正在监听 Ably 通道: '{ABLY_CHANNEL_NAME}'")

    try:
        while True:
            await asyncio.sleep(60)
    except asyncio.CancelledError:
        pass
    finally:
        await ably.close()
        print("🔌 已关闭连接")

if __name__ == "__main__":
    asyncio.run(main())
```

---

## 6️⃣ 预期行为

| 操作 | 结果 |
|------|------|
| 通过 curl 发送日志 | 日志存储到数据库，并推送到 Ably 与 Telegram |
| 运行 Python 示例 | 立即接收实时日志 |
| 查询 `/logs` | 返回最近的日志记录 |

---

## 7️⃣ 注意事项

- 此演示是 **公开环境**，请勿上传真实生产数据。  
- 所有密钥与通道仅用于测试用途。  
- 若部署到生产环境，请使用独立的密钥与令牌。  
