const users = require('../managers/users');
const { EmbedBuilder } = require('discord.js');

const XP_MIN = 10;
const XP_MAX = 20;
const XP_COOLDOWN = 1000; // 1 second in ms

// In-memory cooldown tracker (userId -> last XP grant timestamp)
const xpCooldowns = new Map();

// XP required to reach level N
function xpForLevel(level) {
    return Math.floor(100 * Math.pow(level, 1.2));
}

// Total XP required to reach level N from level 0
function totalXpForLevel(level) {
    let total = 0;
    for (let i = 1; i <= level; i++) {
        total += xpForLevel(i);
    }
    return total;
}

// Get level from total XP
function getLevelFromXp(totalXp) {
    let level = 0;
    let xpNeeded = 0;
    while (xpNeeded <= totalXp) {
        level++;
        xpNeeded += xpForLevel(level);
    }
    return level - 1;
}

// XP progress within current level
function getXpProgress(totalXp) {
    const level = getLevelFromXp(totalXp);
    const xpAtCurrentLevel = totalXpForLevel(level);
    const xpForNext = xpForLevel(level + 1);
    const progress = totalXp - xpAtCurrentLevel;
    return { current: progress, needed: xpForNext };
}

function isOnCooldown(userId) {
    const last = xpCooldowns.get(userId);
    if (!last) return false;
    return Date.now() - last < XP_COOLDOWN;
}

async function grantXp(userId, client) {
    if (isOnCooldown(userId)) return;

    const user = await users.getUser(userId);
    if (!user) return;

    xpCooldowns.set(userId, Date.now());

    const xpGain = Math.floor(Math.random() * (XP_MAX - XP_MIN + 1)) + XP_MIN;
    const currentXp = user.xp || 0;
    const newXp = currentXp + xpGain;

    const oldLevel = getLevelFromXp(currentXp);
    const newLevel = getLevelFromXp(newXp);

    await users.updateUser(userId, { xp: newXp, level: newLevel });

    // Send level up DM if leveled up
    if (newLevel > oldLevel && client) {
        try {
            const discordUser = await client.users.fetch(userId);
            const embed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle('Level Up!')
                .setDescription(`You reached **Level ${newLevel}**!`)
                .addFields(
                    { name: 'Total XP', value: newXp.toString(), inline: true },
                    { name: 'Level', value: newLevel.toString(), inline: true }
                )
                .setTimestamp();
            await discordUser.send({ embeds: [embed] });
        } catch (error) {
            console.error('Error sending level up DM:', error);
        }
    }
}

module.exports = {
    grantXp,
    getLevelFromXp,
    getXpProgress,
    xpForLevel,
    totalXpForLevel
};
