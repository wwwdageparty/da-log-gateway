# 🧪 da-log Demo Test Guide
[中文](./README_CN.md)

## 1️⃣ Overview

This is a **demo environment** for the **da-log gateway**, a lightweight Cloudflare Workers–based log system that supports:
- Writing logs via HTTP
- Reading logs from database
- Broadcasting logs via **Ably** (real-time pub/sub)
- Sending messages to **Telegram channels**

> ⚠️ Note:  
> For security reasons, the `/systemInit` endpoint is **disabled** in demo mode.  
> Database and channel connections are pre-initialized.

---

## 2️⃣ Demo Information

| Type | Details |
|------|----------|
| 🌐 Log Gateway URL | `https://demo.dglog.workers.dev/` |
| ✏️ Write Token | `Demo111+` |
| 📖 Read Token | `Demo222-` |
| 🔔 Ably Channel | `dademo` |
| 🔑 Ably Subscribe Key | `oVDZ0A.ubTYGA:zSVyaT8TFujR-w1s3hbUpPdkgaSXYd6YjKngg4f1-QU` |
| 💬 Telegram Channel | [Private link](https://t.me/+3fbwV28BdZ4wNTk1) |

---

## 3️⃣ How to Test Log Writing

You can send logs to the gateway with a simple `POST` request:

```bash
curl -X POST https://demo.dglog.workers.dev/ \
  -H "Content-Type: application/json" \
  -H "Authorization: Demo111+" \
  -d '{
    "service": "demo-service",
    "instance": "instance-1",
    "level": 2,
    "message": "Hello from demo test!"
  }'
```

✅ The log will:
- Be written into the database.
- Broadcast to Ably channel `dademo`.
- Forwarded to the demo Telegram group.

---

## 4️⃣ How to Read Logs

You can query logs from the same gateway using the read token:

```bash
curl -X POST https://demo.dglog.workers.dev/logs \
  -H "Content-Type: application/json" \
  -H "Authorization: Demo222-" \
  -d '{"limit": 5}'
```

---

## 5️⃣ Real-time Log Listening (Python Demo)

This Python demo connects to the Ably channel `dademo` and prints logs as they are broadcast from the Worker.

### ✅ Example Code

```python
import asyncio
import json
from ably import AblyRealtime

# ---------- Config (Public Demo Keys) ----------
ABLY_API_KEY = "oVDZ0A.ubTYGA:zSVyaT8TFujR-w1s3hbUpPdkgaSXYd6YjKngg4f1-QU"
ABLY_CHANNEL_NAME = "dademo"

# ---------- Log analysis / print ----------
def analyze_log(message):
    '''Parse and print a log message from Ably (robust to a few formats).'''
    print(f"\n📨 Received message on channel '{getattr(message, 'channel', None)}' name='{getattr(message, 'name', None)}'")
    data = message.data

    if isinstance(data, dict) and "data" in data:
        data = data["data"]

    if isinstance(data, str):
        try:
            data = json.loads(data)
        except json.JSONDecodeError:
            print(f"📝 Plain text: {data}")
            return

    if not isinstance(data, dict):
        print(f"⚠️ Unknown data format: {data}")
        return

    service = data.get("service", "?")
    instance = data.get("instance", "?")
    level = data.get("level", "?")
    message = data.get("message", "(no message)")

    print("━━━━━━━━━━━━━━━━━━━━━━━━━━")
    print(f"🧩 Service:   {service}")
    print(f"🏷️ Instance:  {instance}")
    print(f"🔢 Level:     {level}")
    print(f"🗒️ Message:   {message}")
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━")

# ---------- Main Ably client ----------
async def main():
    ably = AblyRealtime(ABLY_API_KEY)
    await ably.connection.once_async("connected")
    print("✅ Connected to Ably")
    print(f"🔗 Connection state: {ably.connection.state}")

    channel = ably.channels.get(ABLY_CHANNEL_NAME)
    await channel.subscribe(analyze_log)
    print(f"👂 Listening on Ably channel: '{ABLY_CHANNEL_NAME}'")

    try:
        i_loop = 0
        while True:
            await asyncio.sleep(60)
            i_loop += 1
            print(f"⏳ Alive check: loop {i_loop}")
    except asyncio.CancelledError:
        pass
    finally:
        await ably.close()
        print("🔌 Connection closed.")

if __name__ == "__main__":
    asyncio.run(main())
```

### ▶️ Run It
```bash
pip install ably
python demo_listener.py
```

Then, when you send logs (via curl or your app), you’ll see real-time log entries printed to your console.

---

## 6️⃣ Expected Behavior

| Action | Result |
|--------|---------|
| Send log via curl | Log stored in DB, pushed to Ably & Telegram |
| Run Python demo | Receives log instantly |
| Query `/logs` | Returns recent log entries |

---

## 7️⃣ Notes

- This demo is **public**, so don’t use real production data.
- The Ably key and Telegram channel are for demo only.
- For your own deployment, you’ll generate unique keys and tokens.
