const { db } = require('../managers/db');

// In-memory only (not persisted - that's fine)
const reconnectTimers = new Map();
const pendingReconnectRequests = new Map();
const cleanupTimers = new Map();

// Convert DB row to call object
function rowToCall(row) {
    if (!row) return null;
    return {
        callId: row.call_id,
        channel1Id: row.channel1_id,
        channel2Id: row.channel2_id,
        guild1Id: row.guild1_id,
        guild2Id: row.guild2_id,
        startTime: row.start_time,
        endTime: row.end_time,
        status: row.status,
        messages: row.messages,
        reconnectWindow: row.reconnect_window
    };
}

function generateCallId() {
    return 'call_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

async function deleteCall(callId) {
    await db.execute({ sql: 'DELETE FROM calls WHERE call_id = ?', args: [callId] });
    cleanupTimers.delete(callId);
}

function scheduleCallCleanup(callId) {
    if (cleanupTimers.has(callId)) clearTimeout(cleanupTimers.get(callId));
    const timeoutId = setTimeout(() => deleteCall(callId), 5 * 60 * 1000);
    cleanupTimers.set(callId, timeoutId);
}

async function createCall(channel1Id, channel2Id, guild1Id, guild2Id) {
    const callId = generateCallId();
    const now = Date.now();

    await db.execute({
        sql: `INSERT INTO calls (call_id, channel1_id, channel2_id, guild1_id, guild2_id, start_time, end_time, status, messages, reconnect_window)
              VALUES (?, ?, ?, ?, ?, ?, NULL, 'active', 0, NULL)`,
        args: [callId, channel1Id, channel2Id, guild1Id, guild2Id, now]
    });

    return await getCall(callId);
}

async function getCall(callId) {
    const result = await db.execute({ sql: 'SELECT * FROM calls WHERE call_id = ?', args: [callId] });
    return rowToCall(result.rows[0] || null);
}

async function getCallByChannels(channelId) {
    const result = await db.execute({
        sql: `SELECT * FROM calls WHERE (channel1_id = ? OR channel2_id = ?) AND status = 'active' LIMIT 1`,
        args: [channelId, channelId]
    });
    return rowToCall(result.rows[0] || null);
}

async function endCall(callId) {
    const now = Date.now();
    const reconnectWindow = now + (5 * 60 * 1000);

    await db.execute({
        sql: `UPDATE calls SET status = 'ended', end_time = ?, reconnect_window = ? WHERE call_id = ?`,
        args: [now, reconnectWindow, callId]
    });

    scheduleCallCleanup(callId);
    return await getCall(callId);
}

async function incrementMessageCount(callId) {
    await db.execute({
        sql: 'UPDATE calls SET messages = messages + 1 WHERE call_id = ?',
        args: [callId]
    });
}

async function getAllActiveCalls() {
    const result = await db.execute(`SELECT * FROM calls WHERE status = 'active'`);
    return result.rows.map(rowToCall);
}

async function getCallHistory(guildId, limit = 10) {
    const result = await db.execute({
        sql: `SELECT * FROM calls WHERE guild1_id = ? OR guild2_id = ? ORDER BY start_time DESC LIMIT ?`,
        args: [guildId, guildId, limit]
    });
    return result.rows.map(rowToCall);
}

async function getLastEndedCall(channelId) {
    const now = Date.now();
    const result = await db.execute({
        sql: `SELECT * FROM calls 
              WHERE (channel1_id = ? OR channel2_id = ?) 
              AND status = 'ended' 
              AND reconnect_window IS NOT NULL 
              AND reconnect_window > ?
              ORDER BY end_time DESC LIMIT 1`,
        args: [channelId, channelId, now]
    });
    return rowToCall(result.rows[0] || null);
}

function getOtherChannelId(call, channelId) {
    if (!call) return null;
    return call.channel1Id === channelId ? call.channel2Id : call.channel1Id;
}

function setReconnectTimer(callId, timeoutId) {
    reconnectTimers.set(callId, timeoutId);
}

function clearReconnectTimer(callId) {
    const timeoutId = reconnectTimers.get(callId);
    if (timeoutId) {
        clearTimeout(timeoutId);
        reconnectTimers.delete(callId);
    }
}

function setPendingReconnectRequest(callId, requesterId, requesterDisplayName, requesterChannelId) {
    pendingReconnectRequests.set(callId, { requesterId, requesterDisplayName, requesterChannelId });
}

function getPendingReconnectRequest(callId) {
    return pendingReconnectRequests.get(callId) || null;
}

function clearPendingReconnectRequest(callId) {
    pendingReconnectRequests.delete(callId);
}

async function reactiveCall(callId) {
    await db.execute({
        sql: `UPDATE calls SET status = 'active', end_time = NULL, reconnect_window = NULL WHERE call_id = ?`,
        args: [callId]
    });

    if (cleanupTimers.has(callId)) {
        clearTimeout(cleanupTimers.get(callId));
        cleanupTimers.delete(callId);
    }

    return await getCall(callId);
}

async function cleanupOldCallsForChannel(channelId) {
    // Get ended calls for this channel first to cancel their timers
    const result = await db.execute({
        sql: `SELECT call_id FROM calls WHERE (channel1_id = ? OR channel2_id = ?) AND status = 'ended'`,
        args: [channelId, channelId]
    });

    for (const row of result.rows) {
        if (cleanupTimers.has(row.call_id)) {
            clearTimeout(cleanupTimers.get(row.call_id));
            cleanupTimers.delete(row.call_id);
        }
    }

    await db.execute({
        sql: `DELETE FROM calls WHERE (channel1_id = ? OR channel2_id = ?) AND status = 'ended'`,
        args: [channelId, channelId]
    });
}

async function loadCalls() {
    const result = await db.execute('SELECT * FROM calls');
    const calls = {};
    for (const row of result.rows) {
        const call = rowToCall(row);
        calls[call.callId] = call;
    }
    return calls;
}

// Periodic cleanup every 10 minutes
setInterval(async () => {
    const now = Date.now();
    const result = await db.execute({
        sql: `SELECT call_id FROM calls WHERE status = 'ended' AND reconnect_window IS NOT NULL AND reconnect_window < ?`,
        args: [now]
    });

    for (const row of result.rows) {
        if (cleanupTimers.has(row.call_id)) {
            clearTimeout(cleanupTimers.get(row.call_id));
            cleanupTimers.delete(row.call_id);
        }
    }

    await db.execute({
        sql: `DELETE FROM calls WHERE status = 'ended' AND reconnect_window IS NOT NULL AND reconnect_window < ?`,
        args: [now]
    });
}, 10 * 60 * 1000);

module.exports = {
    createCall,
    getCall,
    getCallByChannels,
    endCall,
    incrementMessageCount,
    getAllActiveCalls,
    getCallHistory,
    getLastEndedCall,
    getOtherChannelId,
    setReconnectTimer,
    clearReconnectTimer,
    setPendingReconnectRequest,
    getPendingReconnectRequest,
    clearPendingReconnectRequest,
    reactiveCall,
    cleanupOldCallsForChannel,
    loadCalls
};
