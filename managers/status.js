const { ActivityType } = require('discord.js');

// Change bot online status here
const botStatus = 'Online';

const statusMap = {
    'Online': 'online',
    'Idle': 'idle',
    'DND': 'dnd',
    'Invisible': 'invisible',
    'Streaming': 'online'
};

const statuses = [
    'Send f.help',
    'Made with 💚 by Nova',
    'Connecting servers',
    'FernBot',
    'Bridging communities 🌿',
    'Leaf it to chance',
    'Powered by Spite and Rage'
];

let currentStatusIndex = 0;

function rotateStatus(client) {
    let statusText;
    if (currentStatusIndex === 2) {
        const serverCount = client.guilds.cache.size;
        statusText = `In ${serverCount} servers`;
    } else {
        statusText = statuses[currentStatusIndex];
    }

    const status = statusMap[botStatus] || 'online';
    client.user.setPresence({ 
        status: status,
        activities: [{ name: statusText, type: ActivityType.Playing }]
    });

    currentStatusIndex = (currentStatusIndex + 1) % statuses.length;
}

function startStatusRotation(client, intervalSeconds = 5) {
    rotateStatus(client);
    setInterval(() => {
        rotateStatus(client);
    }, intervalSeconds * 1000);
}

module.exports = {
    startStatusRotation
};
