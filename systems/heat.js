const users = require('../managers/users');
const notify = require('./notify');

const DECAY_RATE = 1;
const DECAY_INTERVAL = 30 * 60 * 1000;

async function getUserHeat(userId) {
    const user = await users.getUser(userId);
    if (!user) return { heat: 0, lastDecay: Date.now() };
    if (user.heat === undefined) {
        await users.updateUser(userId, { heat: 0, lastDecay: Date.now() });
        return { heat: 0, lastDecay: Date.now() };
    }
    return { heat: user.heat, lastDecay: user.lastDecay };
}

async function applyDecay(userId) {
    const user = await users.getUser(userId);
    if (!user) return 0;

    if (user.heat === undefined) {
        await users.updateUser(userId, { heat: 0, lastDecay: Date.now() });
        return 0;
    }

    const now = Date.now();
    const timeSinceLastDecay = now - (user.lastDecay || now);
    const decayIntervals = Math.floor(timeSinceLastDecay / DECAY_INTERVAL);

    if (decayIntervals > 0) {
        const newHeat = Math.max(0, user.heat - (DECAY_RATE * decayIntervals));
        await users.updateUser(userId, { heat: newHeat, lastDecay: now });
        return newHeat;
    }

    return user.heat;
}

async function modifyHeat(userId, amount, client = null) {
    let user = await users.getUser(userId);
    if (!user) {
        user = await users.createUser(userId, 'Unknown');
    }

    if (user.heat === undefined) {
        await users.updateUser(userId, { heat: 0, lastDecay: Date.now() });
    }

    await applyDecay(userId);

    user = await users.getUser(userId);
    const newHeat = Math.max(0, user.heat + amount);
    await users.updateUser(userId, { heat: newHeat, lastDecay: Date.now() });

    if (amount > 0 && client) {
        notify.sendHeatIncreaseNotification(client, userId, newHeat).catch(() => {});
    }

    return newHeat;
}

async function isUserTooHot(userId) {
    await applyDecay(userId);
    const userData = await getUserHeat(userId);
    return userData.heat > 100;
}

module.exports = {
    getUserHeat,
    modifyHeat,
    applyDecay,
    isUserTooHot
};
