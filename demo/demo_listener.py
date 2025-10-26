import asyncio
import json
from ably import AblyRealtime

# ---------- Config (Public Demo Keys) ----------
ABLY_API_KEY = "oVDZ0A.ubTYGA:zSVyaT8TFujR-w1s3hbUpPdkgaSXYd6YjKngg4f1-QU"
ABLY_CHANNEL_NAME = "dademo"

# ---------- Log analysis / print ----------
def analyze_log(message):
    """Parse and print a log message from Ably (robust to a few formats)."""
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

    c1 = data.get("c1", "?")
    c2 = data.get("c2", "?")
    i1 = data.get("i1", "?")
    t1 = data.get("t1", "(no message)")

    print("━━━━━━━━━━━━━━━━━━━━━━━━━━")
    print(f"🧩 Service:   {c1}")
    print(f"🏷️ Instance:  {c2}")
    print(f"🔢 Level:     {i1}")
    print(f"🗒️ Message:   {t1}")
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
