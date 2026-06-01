const { EmbedBuilder } = require('discord.js');

async function sendHeatIncreaseNotification(client, userId, newHeat) {
    try {
        const user = await client.users.fetch(userId);
        const embed = new EmbedBuilder()
            .setColor('#ff6600')
            .setTitle('🔥 Heat Level Increased')
            .setDescription(`Your heat level has been increased by a moderator.`)
            .addFields(
                {
                    name: 'New Heat Level',
                    value: newHeat.toString(),
                    inline: true
                },
                {
                    name: 'Status',
                    value: newHeat > 100 ? '🚫 Bot access restricted' : '✅ Bot access allowed',
                    inline: true
                }
            )
            .setFooter({ text: 'Heat decays at 1 point every 30 minutes.' })
            .setTimestamp();

        await user.send({ embeds: [embed] });
        return true;
    } catch (error) {
        console.error('Error sending heat increase notification:', error);
        return false;
    }
}

async function sendTierChangeNotification(client, userId, newTier) {
    const tierPerks = {
        0: 'Text only',
        1: 'Text + Stickers',
        2: 'Text + Stickers + GIFs',
        3: 'Text + Stickers + GIFs + Attachments'
    };

    try {
        const user = await client.users.fetch(userId);
        const embed = new EmbedBuilder()
            .setColor('#fba700')
            .setTitle('⭐ Tier Updated')
            .setDescription(`Your tier has been updated by an admin.`)
            .addFields(
                {
                    name: 'New Tier',
                    value: newTier.toString(),
                    inline: true
                },
                {
                    name: 'Perks',
                    value: tierPerks[newTier] || 'Unknown',
                    inline: true
                }
            )
            .setTimestamp();

        await user.send({ embeds: [embed] });
        return true;
    } catch (error) {
        console.error('Error sending tier change notification:', error);
        return false;
    }
}

module.exports = {
    sendHeatIncreaseNotification,
    sendTierChangeNotification
};
