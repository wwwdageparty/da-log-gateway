import asyncio
import json
from ably import AblyRealtime

# ==========================================================
#  DaSystem Log Gateway — Python Demo Subscriber
# ==========================================================
#  ✅ Connects to Ably channel "dademo"
#  ✅ Prints structured logs received from the Cloudflare Worker
#  ✅ Safe for public demo use (no local config files)
# ==========================================================

# ---------- Demo Config ----------
ABLY_API_KEY = "oVDZ0A.ubTYGA:zSVyaT8TFujR-w1s3hbUpPdkgaSXYd6YjKngg4f1-QU"
ABLY_CHANNEL_NAME = "dademo"


# ---------- Log Analysis ----------
def analyze_log(message):
    """Parse and print log message from Ably (handles JSON or plain text)."""

    print(f"\n📨 Message received: channel='{ABLY_CHANNEL_NAME}', name='{getattr(message, 'name', None)}'")
    data = message.data

    # If message is wrapped (e.g. {"data": {...}}), unwrap
    if isinstance(data, dict) and "data" in data and isinstance(data["data"], (dict, str)):
        data = data["data"]

    # Try to decode JSON if it's a string
    if isinstance(data, str):
        try:
            data = json.loads(data)
        except json.JSONDecodeError:
            print(f"📝 Plain text: {data}")
            return

    if not isinstance(data, dict):
        print(f"⚠️ Unknown data format: {data}")
        return

    # Extract fields (new keys)
    service = data.get("service", "?")
    instance = data.get("instance", "?")
    level = data.get("level", "?")
    message = data.get("message", "(no message)")

    # Pretty print
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━")
    print(f"🧩 Service:   {service}")
    print(f"🏷️ Instance:  {instance}")
    print(f"🔢 Level:     {level}")
    print(f"🗒️ Message:   {message}")
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━")


# ---------- Main ----------
async def main():
    ably = AblyRealtime(ABLY_API_KEY)
    await ably.connection.once_async("connected")
    print("✅ Connected to Ably")
    print(f"🔗 Connection state: {ably.connection.state}")

    channel = ably.channels.get(ABLY_CHANNEL_NAME)
    await channel.subscribe(analyze_log)
    print(f"👂 Listening on channel: '{ABLY_CHANNEL_NAME}'")

    try:
        loop_counter = 0
        while True:
            await asyncio.sleep(60)
            loop_counter += 1
            print(f"⏳ Alive check: loop {loop_counter}")
    except asyncio.CancelledError:
        pass
    finally:
        await ably.close()
        print("🔌 Connection closed.")


if __name__ == "__main__":
    asyncio.run(main())

