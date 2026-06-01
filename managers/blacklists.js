const fs = require('fs');
const path = require('path');

const CONFIG_FILE = path.join(__dirname, '../configdata.json');

function loadConfig() {
    try {
        const data = fs.readFileSync(CONFIG_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return { blacklists: { bannedUsers: [], bannedServers: [], bannedWords: [], blacklistedWords: [] } };
    }
}

function saveConfig(config) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

function loadBlacklists() {
    return loadConfig().blacklists || { bannedUsers: [], bannedServers: [], bannedWords: [], blacklistedWords: [] };
}

function saveBlacklists(blacklists) {
    const config = loadConfig();
    config.blacklists = blacklists;
    saveConfig(config);
}

function isUserBlacklisted(userId) {
    const blacklists = loadBlacklists();
    return blacklists.bannedUsers.includes(userId);
}

function isGuildBlacklisted(guildId) {
    const blacklists = loadBlacklists();
    return blacklists.bannedServers.includes(guildId);
}

function containsBannedWords(content) {
    const blacklists = loadBlacklists();

    for (const pattern of blacklists.bannedWords) {
        try {
            const regex = new RegExp(pattern, 'i');
            if (regex.test(content)) return true;
        } catch (error) {
            try {
                const wordRegex = new RegExp(`\\b${pattern.toLowerCase()}\\b`, 'i');
                if (wordRegex.test(content)) return true;
            } catch (innerError) {
                console.error('Invalid pattern:', pattern);
            }
        }
    }

    return false;
}

function censorBlacklistedWords(content) {
    const blacklists = loadBlacklists();
    let censoredContent = content;

    for (const pattern of blacklists.blacklistedWords) {
        try {
            const regex = new RegExp(pattern, 'gi');
            censoredContent = censoredContent.replace(regex, '[REDACTED]');
        } catch (error) {
            try {
                const wordRegex = new RegExp(`\\b${pattern}\\b`, 'gi');
                censoredContent = censoredContent.replace(wordRegex, '[REDACTED]');
            } catch (innerError) {
                console.error('Invalid pattern:', pattern);
            }
        }
    }

    return censoredContent;
}

function filterMentions(content) {
    return content.replace(/@everyone/gi, '@~~everyone~~')
                  .replace(/@here/gi, '@~~here~~');
}

function blacklistUser(userId) {
    const blacklists = loadBlacklists();
    if (!blacklists.bannedUsers.includes(userId)) {
        blacklists.bannedUsers.push(userId);
        saveBlacklists(blacklists);
    }
}

function blacklistGuild(guildId) {
    const blacklists = loadBlacklists();
    if (!blacklists.bannedServers.includes(guildId)) {
        blacklists.bannedServers.push(guildId);
        saveBlacklists(blacklists);
    }
}

function addBannedWord(pattern) {
    const blacklists = loadBlacklists();
    if (!blacklists.bannedWords.includes(pattern)) {
        blacklists.bannedWords.push(pattern);
        saveBlacklists(blacklists);
    }
}

function addBlacklistedWord(pattern) {
    const blacklists = loadBlacklists();
    if (!blacklists.blacklistedWords.includes(pattern)) {
        blacklists.blacklistedWords.push(pattern);
        saveBlacklists(blacklists);
    }
}

function unblacklistUser(userId) {
    const blacklists = loadBlacklists();
    blacklists.bannedUsers = blacklists.bannedUsers.filter(id => id !== userId);
    saveBlacklists(blacklists);
}

function unblacklistGuild(guildId) {
    const blacklists = loadBlacklists();
    blacklists.bannedServers = blacklists.bannedServers.filter(id => id !== guildId);
    saveBlacklists(blacklists);
}

function removeBannedWord(pattern) {
    const blacklists = loadBlacklists();
    blacklists.bannedWords = blacklists.bannedWords.filter(p => p !== pattern);
    saveBlacklists(blacklists);
}

function removeBlacklistedWord(pattern) {
    const blacklists = loadBlacklists();
    blacklists.blacklistedWords = blacklists.blacklistedWords.filter(p => p !== pattern);
    saveBlacklists(blacklists);
}

function getBlacklists() {
    return loadBlacklists();
}

function isLinkAllowed(content) {
    const urlRegex = /(https?:\/\/[^\s]+)/gi;
    const links = content.match(urlRegex);

    if (!links) return true;

    for (const link of links) {
        const isDiscordAttachment = link.startsWith('https://cdn.discordapp.com/attachments/');
        const isTenorLink = link.startsWith('https://tenor.com/view/');
        const isKlipyLink = link.startsWith('https://klipy.com/gifs/');
        const isDiscordEmoji = link.startsWith('https://cdn.discordapp.com/emojis/');

        if (!isDiscordAttachment && !isTenorLink && !isKlipyLink && !isDiscordEmoji) return false;
    }

    return true;
}

module.exports = {
    isUserBlacklisted,
    isGuildBlacklisted,
    containsBannedWords,
    censorBlacklistedWords,
    filterMentions,
    isLinkAllowed,
    blacklistUser,
    blacklistGuild,
    addBannedWord,
    addBlacklistedWord,
    unblacklistUser,
    unblacklistGuild,
    removeBannedWord,
    removeBlacklistedWord,
    getBlacklists,
    loadBlacklists,
    saveBlacklists
};
