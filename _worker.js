/*
  ==========================================================
   DaSystem Log Service — dage.party
  ==========================================================
  A lightweight Cloudflare Workers service for distributed
  log collection, storage, and real-time forwarding.

  ✅ Features
  ----------------------------------------------------------
  • Store logs in Cloudflare D1 (structured schema)
  • Optional Ably channel forwarding (real-time)
  • Optional Telegram notification system
  • Automatic cleanup of old logs
  • Simple REST API for append & query

  🧩 Table Structure (log1)
  ----------------------------------------------------------
    id → auto-increment primary key
    v1 → create_time (auto)
    c1 → service_id
    c2 → instance_id
    i1 → level
    t1 → message

  ⚙️ Environment Variables
  ----------------------------------------------------------
  # Core database binding
  DB                              → Cloudflare D1 database binding

  # Authorization tokens
  DA_WRITETOKEN                     → Required for /log (POST) and /systeminit
  DA_READTOKEN                      → Required for /logs (GET)

  # Telegram integration (optional)
  LOG_TELEGRAM_BOT_TOKEN          → Bot token for normal logs
  LOG_TELEGRAM_CHAT_ID            → Chat ID for normal logs
  LOG_ERROR_THRESHOLD             → Numeric level threshold for error alerts (default: 40)

  # Ably integration (optional)
  ABLY_API_KEY                    → Format: keyName:keySecret
  ABLY_CHANNEL_NAME               → Channel name (default: "system-logs")

  🧱 Deployment
  ----------------------------------------------------------
  You can directly paste this code into the Cloudflare Workers
  online IDE and deploy it immediately.
  It requires a D1 database binding and optional integrations
  (Ably + Telegram).

  💡 Recommendation
  ----------------------------------------------------------
  We recommend configuring Ably (without Telegram) first.
  Then, build a separate "notify service" that connects to the
  same Ably channel to handle custom notifications 
  (e.g. Telegram, Discord, Web, App...).
*/



export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    G_DB = env.DB;
    G_ENV = env;

    // POST /log → insert a new log entry
    if (pathname === "/log" && request.method === "POST") {
      return await appendLog(request);
    }
    if (pathname === "/systeminit" && request.method === "POST") {
      return await systemInit(request);
    }

    // GET /logs → retrieve logs (with filters)
    if (pathname === "/logs" && request.method === "GET") {
      return await queryLogs(request);
    }

    // Default: not found
    return new Response("Not found", { status: 404 });
  },

  async scheduled(event, env, ctx) {
    G_DB = env.DB;
    G_ENV = env;
    ctx.waitUntil(cleanOldLogs());
  },
};

/////////////////////////   Write Logs   /////////////////////////
async function appendLog(request) {
  const unauthorized = checkAuthorizationWrite(request);
  if (unauthorized) return unauthorized;

  try {
    const body = await request.json();
    const { c1, c2, i1, t1 } = body;

    // Basic validation
    if (!c1 || !c2 || i1 === undefined || !t1) {
      return new Response(
        JSON.stringify({ error: "Missing one or more required fields (c1, c2, i1, t1)" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Insert into database (v1 auto-generated)
    await G_DB.prepare(
      `INSERT INTO log1 (c1, c2, i1, t1) VALUES (?, ?, ?, ?)`
    ).bind(c1, c2, i1, t1).run();

    // Forward to Ably and Telegram (object form)
    await forwardToAbly(body);
    await notifyTelegram(body);

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });

  } catch (err) {
    await errDelegate(`appendLog error: ${err.stack || err.message || err}`);

    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

/////////////////////////   Read Logs   /////////////////////////
async function queryLogs(request) {
  const unauthorized = checkAuthorizationRead(request);
  if (unauthorized) return unauthorized;

  try {
    const { searchParams } = new URL(request.url);

    const filters = [];
    const values = [];

    const c1 = searchParams.get("service_id");
    const c2 = searchParams.get("instance_id");
    const i1 = searchParams.get("level");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const limit = parseInt(searchParams.get("limit") || "50", 10);

    if (c1) { filters.push("c1 = ?"); values.push(c1); }
    if (c2) { filters.push("c2 = ?"); values.push(c2); }
    if (i1) { filters.push("i1 = ?"); values.push(i1); }
    if (from) { filters.push("v1 >= ?"); values.push(from); }
    if (to) { filters.push("v1 <= ?"); values.push(to); }

    const whereClause = filters.length ? "WHERE " + filters.join(" AND ") : "";
    const sql = `SELECT * FROM log1 ${whereClause} ORDER BY id DESC LIMIT ?`;
    values.push(limit);

    const result = await G_DB.prepare(sql).bind(...values).all();

    return new Response(JSON.stringify(result.results), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

/////////////////////////   Cleanup   /////////////////////////
async function cleanOldLogs() {
  try {
    const cutoff = new Date(Date.now() - C_RETENTION_DAYS * 24 * 60 * 60 * 1000)
      .toISOString();

    const result = await G_DB.prepare(
      `DELETE FROM log1 WHERE v1 < ?`
    ).bind(cutoff).run();

    const deleted = result.meta?.changes ?? 0;
    await logDelegate(`🧹 Deleted ${deleted} old logs (before ${cutoff}).`);
    return deleted;
  } catch (err) {
    console.error("Error cleaning logs:", err);
  }
}

/////////////////////////   Auth   /////////////////////////
function checkAuthorizationRead(request) {
  return checkAuthorization(request, G_ENV.DA_READTOKEN);
}
function checkAuthorizationWrite(request) {
  return checkAuthorization(request, G_ENV.DA_WRITETOKEN);
}
function checkAuthorization(request, expected) {
  // Allow all if token not set
  if (!expected || expected.trim() === "") {
    return null;
  }

  const authHeader = request.headers.get("Authorization") || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : null;

  if (token !== expected) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  return null;
}

/////////////////////////   System   /////////////////////////
async function createDaTableSchema(db, tableName) {
  const tableSchema = `
    CREATE TABLE IF NOT EXISTS ${tableName} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      c1 VARCHAR(255),
      c2 VARCHAR(255),
      c3 VARCHAR(255),
      i1 INT,
      i2 INT,
      i3 INT,
      d1 DOUBLE,
      d2 DOUBLE,
      d3 DOUBLE,
      t1 TEXT,
      t2 TEXT,
      t3 TEXT,
      v1 TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      v2 TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      v3 TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

  await db.prepare(tableSchema).run();
}
async function logTableInit(db) {
  await createDaTableSchema(db, C_LogTableName);

  const indexStatements = [
    `CREATE INDEX IF NOT EXISTS idx_${C_LogTableName}_c1 ON ${C_LogTableName}(c1);`,
    `CREATE INDEX IF NOT EXISTS idx_${C_LogTableName}_c2 ON ${C_LogTableName}(c2);`,
    `CREATE INDEX IF NOT EXISTS idx_${C_LogTableName}_i1 ON ${C_LogTableName}(i1);`,
    `CREATE INDEX IF NOT EXISTS idx_${C_LogTableName}_v1 ON ${C_LogTableName}(v1);`
  ];

  for (const stmt of indexStatements) {
    await db.exec(stmt);
  }

  await logDelegate(`✅ Log table '${C_LogTableName}' and indexes initialized.`);
}
async function daSystemTableInit(db) {
  const tableName = DB_DA_SYSTEM_TABLENAME;
  await createDaTableSchema(db, tableName);

  try {
    const newUuid = crypto.randomUUID();
    const logUuid = crypto.randomUUID();

    const queries = [
      {
        desc: "Insert DB version record",
        sql: `INSERT OR IGNORE INTO ${tableName} (id, c1, c2, i1, d1)
              VALUES (1, '___basic_db_version', ?, ?, ?);`,
        params: [newUuid, DB_VERSION, DB_VERSION],
      },
      {
        desc: "Insert system reserve record",
        sql: `INSERT OR IGNORE INTO ${tableName} (id, c1)
              VALUES (100, '___systemReserve');`,
      },
      {
        desc: "Insert or replace log service version",
        sql: `INSERT OR REPLACE INTO ${tableName} (id, c1, c2, i1, t1)
              VALUES (101, '___log_service_version', ?, ?, ?);`,
        params: [logUuid, LOG_SERVICE_VERSION, 'log1 schema v1'],
      },
    ];

    for (const q of queries) {
      const stmt = q.params ? db.prepare(q.sql).bind(...q.params) : db.prepare(q.sql);
      await stmt.run();
    }

    await logDelegate(`✅ System config table '${tableName}' initialized.`);
  } catch (error) {
    await errDelegate(`❌ Error initializing system table '${tableName}': ${error}`);
    throw error;
  }
}


async function systemInit(request) {
  const unauthorized = checkAuthorizationWrite(request);
  if (unauthorized) return unauthorized;

  const responseHeaders = { "Content-Type": "application/json" };
  const summary = { ok: false, steps: [] };

  try {
    // Initialize system and log tables
    await daSystemTableInit(G_DB);
    summary.steps.push("System config table initialized.");

    await logTableInit(G_DB);
    summary.steps.push("Log table initialized.");

    await logDelegate("✅ System and Log Service initialized successfully.");
    summary.ok = true;

    return new Response(JSON.stringify({
      success: true,
      message: "System and Log Service initialized successfully.",
      details: summary.steps,
    }), { headers: responseHeaders, status: 200 });

  } catch (err) {
    await errDelegate(`❌ System initialization failed: ${err}`);

    return new Response(JSON.stringify({
      success: false,
      error: err.message || String(err),
      details: summary.steps,
    }), { headers: responseHeaders, status: 500 });
  }
}
  

/////////////////////////   Utility   /////////////////////////
/////////////////////////   Utility   /////////////////////////
async function logDelegate(message) {
  console.log(message);
  await sendTelegramMessage(message, false);
}

async function errDelegate(message) {
  console.error(message);
  await sendTelegramMessage(message, true);
}

async function sendTelegramMessage(message, isError) {
  try {
    if (!G_ENV) return;

    // Prefer error-specific bot/chat, fallback to log bot/chat
    const botToken = G_ENV.LOG_TELEGRAM_BOT_TOKEN

    const chatId = G_ENV.LOG_TELEGRAM_CHAT_ID

    if (!botToken || !chatId) return;

    const apiUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const textPrefix = isError ? "❌ *ERROR*\n" : "🪵 *LOG*\n";
    const payload = {
      chat_id: chatId,
      text: `${textPrefix}${message}`,
      parse_mode: "Markdown",
    };

    await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(err => console.error("Telegram send error:", err));
  } catch (err) {
    console.error("sendTelegramMessage failed:", err);
  }
}
async function forwardToAbly(logData) {
  try {
    if (!G_ENV?.ABLY_API_KEY) return;

    const [keyName, keySecret] = G_ENV.ABLY_API_KEY.split(":");
    if (!keyName || !keySecret) {
      await errDelegate("Invalid ABLY_API_KEY: expected format 'keyName:keySecret'");
      return;
    }

    const channelName = G_ENV.ABLY_CHANNEL_NAME || "system-logs";

    await fetch(`https://rest.ably.io/channels/${encodeURIComponent(channelName)}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Basic " + btoa(`${keyName}:${keySecret}`),
      },
      body: JSON.stringify({
        name: "dalog",
        data: logData
      }),
    });
  } catch (err) {
    await errDelegate(`forwardToAbly error: ${err.message}`);
  }
}
async function notifyTelegram(logData) {
  try {
    if (!G_ENV) return;

    const botToken = G_ENV.LOG_TELEGRAM_BOT_TOKEN

    const chatId = G_ENV.LOG_TELEGRAM_CHAT_ID

    if (!botToken || !chatId) return;

    const apiUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const msg = `${logData.t1}\n\n🧩 ${logData.c1}/${logData.c2}\n🔢 Level: ${logData.i1}`;

    await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: msg, parse_mode: "Markdown" }),
    });
  } catch (err) {
    await errDelegate(`notifyTelegramByLevel error: ${err.message}`);
  }
}


/////////////////////////   Globals   /////////////////////////
let G_DB = null;
let G_ENV = null;
const C_RETENTION_DAYS = 7;
const C_LogTableName = "log1";
const DB_VERSION = 1;
const DB_DA_SYSTEM_TABLENAME = "__DA_SYSTEM_CONFIG";
const LOG_SERVICE_VERSION = 1;
