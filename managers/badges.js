const fs = require('fs');
const path = require('path');

const CONFIG_FILE = path.join(__dirname, '../configdata.json');

function loadConfig() {
    try {
        const data = fs.readFileSync(CONFIG_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return { badges: {} };
    }
}

function loadBadges() {
    return loadConfig().badges || {};
}

function getBadgeEmoji(badgeId) {
    const badges = loadBadges();
    return badges[badgeId] || '';
}

function formatBadges(userBadges) {
    if (!userBadges || userBadges.length === 0) return '';
    const badges = loadBadges();
    const badgeEmojis = userBadges
        .map(badgeId => badges[badgeId])
        .filter(emoji => emoji)
        .join(' ');
    return badgeEmojis ? `-# ${badgeEmojis}` : '';
}

module.exports = {
    loadBadges,
    getBadgeEmoji,
    formatBadges
};
