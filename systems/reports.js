const { EmbedBuilder } = require('discord.js');

const REPORT_CHANNEL_ID = '1442295618025295974';

function createReportEmbed(reportedUserTag, reportedMessageId, reporterTag, reason) {
    return new EmbedBuilder()
        .setColor('#ff0000')
        .setTitle('📋 New Report Submitted')
        .addFields(
            {
                name: 'Reported User',
                value: reportedUserTag,
                inline: true
            },
            {
                name: 'Reporter',
                value: reporterTag,
                inline: true
            },
            {
                name: 'Message ID',
                value: reportedMessageId,
                inline: true
            },
            {
                name: 'Reason',
                value: reason,
                inline: false
            }
        )
        .setTimestamp();
}

async function sendReport(client, reportedUserTag, reportedMessageId, reporterTag, reason) {
    try {
        const channel = await client.channels.fetch(REPORT_CHANNEL_ID);
        const embed = createReportEmbed(reportedUserTag, reportedMessageId, reporterTag, reason);
        await channel.send({ embeds: [embed] });
        return true;
    } catch (error) {
        console.error('Error sending report to channel:', error);
        return false;
    }
}

async function sendCallReport(client, reporterTag, reporterChannelId, reportedChannelId, reason) {
    try {
        const channel = await client.channels.fetch(REPORT_CHANNEL_ID);
        const embed = new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('📋 Call Report Submitted')
            .addFields(
                {
                    name: 'Reporter',
                    value: reporterTag,
                    inline: true
                },
                {
                    name: 'Reporter Channel ID',
                    value: reporterChannelId,
                    inline: true
                },
                {
                    name: 'Reported Channel ID',
                    value: reportedChannelId,
                    inline: true
                },
                {
                    name: 'Reason',
                    value: reason,
                    inline: false
                }
            )
            .setTimestamp();
        await channel.send({ embeds: [embed] });
        return true;
    } catch (error) {
        console.error('Error sending call report to channel:', error);
        return false;
    }
}

async function sendMessageReport(client, reportedUserId, reporterUserId, messageContent) {
    try {
        const channel = await client.channels.fetch(REPORT_CHANNEL_ID);
        const embed = new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('📋 Message Report Submitted')
            .addFields(
                {
                    name: 'Reported User',
                    value: `\`\`\`${reportedUserId}\`\`\``,
                    inline: true
                },
                {
                    name: 'Reported By',
                    value: `\`\`\`${reporterUserId}\`\`\``,
                    inline: true
                },
                {
                    name: 'Message',
                    value: messageContent.length > 1024 ? messageContent.substring(0, 1021) + '...' : messageContent,
                    inline: false
                }
            )
            .setTimestamp();
        await channel.send({ embeds: [embed] });
        return true;
    } catch (error) {
        console.error('Error sending message report to channel:', error);
        return false;
    }
}

module.exports = {
    sendReport,
    sendCallReport,
    sendMessageReport,
    REPORT_CHANNEL_ID
};
