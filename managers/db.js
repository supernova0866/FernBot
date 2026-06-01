const { createClient } = require('@libsql/client');

const db = createClient({
    url: process.env.TURSO_URL || 'libsql://fernbot-beta-julie.aws-us-west-2.turso.io',
    authToken: process.env.TURSO_TOKEN
});

// Run on startup to create tables if they don't exist
async function initDB() {
    await db.execute(`
        CREATE TABLE IF NOT EXISTS users (
            user_id TEXT PRIMARY KEY,
            username TEXT NOT NULL,
            accepted INTEGER DEFAULT 0,
            tier INTEGER DEFAULT 0,
            badges TEXT DEFAULT '[]',
            badge_visibility INTEGER DEFAULT 1,
            msgsent INTEGER DEFAULT 0,
            heat INTEGER DEFAULT 0,
            last_decay INTEGER,
            reputation INTEGER DEFAULT 0,
            xp INTEGER DEFAULT 0,
            level INTEGER DEFAULT 0,
            created_at INTEGER
        )
    `);

    await db.execute(`
        CREATE TABLE IF NOT EXISTS calls (
            call_id TEXT PRIMARY KEY,
            channel1_id TEXT NOT NULL,
            channel2_id TEXT NOT NULL,
            guild1_id TEXT NOT NULL,
            guild2_id TEXT NOT NULL,
            start_time INTEGER NOT NULL,
            end_time INTEGER,
            status TEXT DEFAULT 'active',
            messages INTEGER DEFAULT 0,
            reconnect_window INTEGER
        )
    `);

    console.log('✅ Turso DB initialized');
}

module.exports = { db, initDB };
