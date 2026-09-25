const initSqlJs = require("sql.js");
const fs = require("fs");
const path = require("path");

let dbInstance = null;
const dbPath = path.join(__dirname, "dev.db");

async function getDb() {
  if (dbInstance) return dbInstance;

  const SQL = await initSqlJs();
  let filebuffer = null;
  if (fs.existsSync(dbPath)) {
    filebuffer = fs.readFileSync(dbPath);
  }

  const db = new SQL.Database(filebuffer);

  const save = () => {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
  };

  dbInstance = {
    exec: async (sql) => {
      db.exec(sql);
      save();
    },
    run: async (sql, params = []) => {
      db.run(sql, params);
      save();
    },
    get: async (sql, params = []) => {
      const stmt = db.prepare(sql);
      stmt.bind(params);
      let row = null;
      if (stmt.step()) {
        row = stmt.getAsObject();
      }
      stmt.free();
      return row;
    },
    all: async (sql, params = []) => {
      const stmt = db.prepare(sql);
      stmt.bind(params);
      const rows = [];
      while (stmt.step()) {
        rows.push(stmt.getAsObject());
      }
      stmt.free();
      return rows;
    },
  };

  await dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      telegram_id TEXT UNIQUE NOT NULL,
      username TEXT,
      first_name TEXT,
      coins INTEGER DEFAULT 250,
      usdt REAL DEFAULT 0.0,
      wallet_address TEXT,
      is_admin INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      reward_coins INTEGER NOT NULL,
      link_url TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS user_tasks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      task_id TEXT NOT NULL,
      completed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, task_id)
    );

    CREATE TABLE IF NOT EXISTS referrals (
      id TEXT PRIMARY KEY,
      referrer_id TEXT NOT NULL,
      referred_id TEXT UNIQUE NOT NULL,
      reward_claimed INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS withdrawals (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      amount_usdt REAL NOT NULL,
      wallet_address TEXT NOT NULL,
      status TEXT DEFAULT 'PENDING',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  return dbInstance;
}

module.exports = { getDb };
