const { db } = require('./db');

// Convert DB row to user object
function rowToUser(row) {
    if (!row) return null;
    return {
        userID: row.user_id,
        username: row.username,
        accepted: row.accepted === 1,
        tier: row.tier,
        badges: JSON.parse(row.badges || '[]'),
        badgeVisibility: row.badge_visibility === 1,
        msgsent: row.msgsent,
        heat: row.heat,
        lastDecay: row.last_decay,
        reputation: row.reputation,
        xp: row.xp,
        level: row.level
    };
}

async function getUser(userId) {
    const result = await db.execute({
        sql: 'SELECT * FROM users WHERE user_id = ?',
        args: [userId]
    });
    return rowToUser(result.rows[0] || null);
}

async function createUser(userId, username) {
    const existing = await getUser(userId);
    if (existing) return existing;

    const now = Date.now();
    await db.execute({
        sql: `INSERT INTO users 
              (user_id, username, accepted, tier, badges, badge_visibility, msgsent, heat, last_decay, reputation, xp, level, created_at)
              VALUES (?, ?, 0, 0, '[]', 1, 0, 0, ?, 0, 0, 0, ?)`,
        args: [userId, username, now, now]
    });

    return await getUser(userId);
}

async function updateUser(userId, updates) {
    const fields = {
        username:         'username',
        accepted:         'accepted',
        tier:             'tier',
        badges:           'badges',
        badgeVisibility:  'badge_visibility',
        msgsent:          'msgsent',
        heat:             'heat',
        lastDecay:        'last_decay',
        reputation:       'reputation',
        xp:               'xp',
        level:            'level'
    };

    const setClauses = [];
    const args = [];

    for (const [key, col] of Object.entries(fields)) {
        if (key in updates) {
            setClauses.push(`${col} = ?`);
            let val = updates[key];
            // Booleans to integers
            if (typeof val === 'boolean') val = val ? 1 : 0;
            // Arrays to JSON string
            if (Array.isArray(val)) val = JSON.stringify(val);
            args.push(val);
        }
    }

    if (setClauses.length === 0) return await getUser(userId);

    args.push(userId);
    await db.execute({
        sql: `UPDATE users SET ${setClauses.join(', ')} WHERE user_id = ?`,
        args
    });

    return await getUser(userId);
}

async function incrementMessageCount(userId) {
    await db.execute({
        sql: 'UPDATE users SET msgsent = msgsent + 1 WHERE user_id = ?',
        args: [userId]
    });
}

async function hasAccepted(userId) {
    const user = await getUser(userId);
    return user ? user.accepted : false;
}

async function acceptTerms(userId) {
    await updateUser(userId, { accepted: true });
}

async function loadUsers() {
    const result = await db.execute('SELECT * FROM users');
    const users = {};
    for (const row of result.rows) {
        const user = rowToUser(row);
        users[user.userID] = user;
    }
    return users;
}

module.exports = {
    getUser,
    createUser,
    updateUser,
    incrementMessageCount,
    hasAccepted,
    acceptTerms,
    loadUsers
};
