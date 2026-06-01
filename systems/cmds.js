const { 
    EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags,
    ContainerBuilder, SectionBuilder, TextDisplayBuilder, SeparatorBuilder,
    ThumbnailBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder,
    SeparatorSpacingSize
} = require('discord.js');
const calls = require('./calls');
const notify = require('./notify');
const levels = require('./levels');

const queue = [];
const activeConnections = new Map();

function createSearchingEmbed() {
    return new EmbedBuilder()
        .setColor('#fba700')
        .setTitle('📞 Searching...')
        .setDescription('Looking for another server to connect with...')
        .setTimestamp();
}

function createConnectedEmbed(partnerGuildName) {
    return new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('📞 Connected!')
        .setDescription(`You are now connected to **${partnerGuildName}**.\nUse \`f.hangup\` or \`f.h\` to disconnect.`)
        .setTimestamp();
}

function createCallEndedEmbed(byOther = false) {
    const description = byOther 
        ? 'The other server has disconnected.'
        : 'The call has been disconnected.';

    return new EmbedBuilder()
        .setColor('#ff0000')
        .setTitle('📞 Call Ended')
        .setDescription(description)
        .setTimestamp();
}

function createFriendRequestSentEmbed() {
    return new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('📩 Friend Request Sent')
        .setDescription('Your friend request was sent.')
        .setTimestamp();
}

function createFriendRequestReceivedEmbed(displayName, username) {
    return new EmbedBuilder()
        .setColor('#fba700')
        .setTitle('📩 Friend Request')
        .setDescription(`**${displayName}** wants to add you! Their username is \`${username}\``)
        .setTimestamp();
}

function createAcceptTermsEmbed() {
    return new EmbedBuilder()
        .setColor('#fba700')
        .setTitle('Welcome to FernBot')
        .setDescription('To use the bot, you must agree to:\n- Rules\n- T&C\n- TOC\n\n-# Violation of any may result in ban')
        .setTimestamp();
}

function createAcceptButton() {
    return new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('accept_terms')
                .setLabel('Accept')
                .setStyle(ButtonStyle.Success)
        );
}

async function handleCall(message) {
    const channelId = message.channel.id;
    const guildId = message.guild.id;

    if (activeConnections.has(channelId)) {
        const embed = new EmbedBuilder()
            .setColor('#ff0000')
            .setDescription('📞 This channel is already in a call! Use `f.hangup` or `f.skip` first.')
            .setTimestamp();
        return message.reply({ embeds: [embed] });
    }

    const existingInQueue = queue.findIndex(q => q.channelId === channelId);
    if (existingInQueue !== -1) {
        const embed = new EmbedBuilder()
            .setColor('#fba700')
            .setDescription('⏳ You\'re already in the queue waiting for a match!')
            .setTimestamp();
        return message.reply({ embeds: [embed] });
    }

    // Clean up old ended calls for this channel
    await calls.cleanupOldCallsForChannel(channelId);

    if (queue.length > 0) {
        const matchIndex = queue.findIndex(q => q.guildId !== guildId);
        if (matchIndex === -1) {
            queue.push({ channelId, guildId, channel: message.channel });
            return message.reply({ embeds: [createSearchingEmbed()] });
        }

        const match = queue.splice(matchIndex, 1)[0];

        const newCall = await calls.createCall(channelId, match.channelId, guildId, match.guildId);
        await connectChannels(message.channel, match.channel, newCall.callId);
        message.reply({ embeds: [createConnectedEmbed(match.channel.guild.name)] });
        match.channel.send({ embeds: [createConnectedEmbed(message.channel.guild.name)] });
    } else {
        queue.push({ channelId, guildId, channel: message.channel });
        message.reply({ embeds: [createSearchingEmbed()] });
    }
}

async function handleHangup(message) {
    const channelId = message.channel.id;

    const queueIndex = queue.findIndex(q => q.channelId === channelId);
    if (queueIndex !== -1) {
        queue.splice(queueIndex, 1);
        const embed = new EmbedBuilder()
            .setColor('#ff0000')
            .setDescription('❌ Removed from queue.')
            .setTimestamp();
        return message.reply({ embeds: [embed] });
    }

    const connection = activeConnections.get(channelId);
    if (!connection) {
        const embed = new EmbedBuilder()
            .setColor('#ff0000')
            .setDescription('❌ This channel is not in a call.')
            .setTimestamp();
        return message.reply({ embeds: [embed] });
    }

    const partnerChannelId = connection.partnerChannelId;
    const partnerConnection = activeConnections.get(partnerChannelId);

    // Find the corresponding call and mark it as ended
    const activeCalls = await calls.getAllActiveCalls();
    for (const call of activeCalls) {
        if ((call.channel1Id === channelId || call.channel2Id === channelId) && call.status === 'active') {
            await calls.endCall(call.callId);
            break;
        }
    }

    try {
        await connection.webhook.delete();
    } catch (error) {
        console.error('Error deleting webhook:', error);
    }

    activeConnections.delete(channelId);
    activeConnections.delete(partnerChannelId);

    message.reply({ embeds: [createCallEndedEmbed(false)] });

    if (partnerConnection && partnerConnection.channel) {
        try {
            await partnerConnection.webhook.delete();
            partnerConnection.channel.send({ embeds: [createCallEndedEmbed(true)] });
        } catch (error) {
            console.error('Error notifying partner:', error);
        }
    }
}

async function handleSkip(message) {
    await handleHangup(message);
    await handleCall(message);
}

async function handleFriend(message, users, displayName) {
    const channelId = message.channel.id;
    const connection = activeConnections.get(channelId);

    if (!connection) {
        const embed = new EmbedBuilder()
            .setColor('#ff0000')
            .setDescription('❌ You need to be in a call to send a friend message!')
            .setTimestamp();
        return message.reply({ embeds: [embed] });
    }

    const username = message.author.username;

    try {
        const receivedEmbed = createFriendRequestReceivedEmbed(displayName, username);
        await connection.partnerWebhook.send({ embeds: [receivedEmbed] });

        message.reply({ embeds: [createFriendRequestSentEmbed()] });
    } catch (error) {
        console.error('Error sending friend message:', error);
        const embed = new EmbedBuilder()
            .setColor('#ff0000')
            .setDescription('❌ Failed to send friend message.')
            .setTimestamp();
        message.reply({ embeds: [embed] });
    }
}

async function handleBadgeEnable(message, users) {
    const userId = message.author.id;
    const user = await users.getUser(userId);

    if (!user) {
        const embed = new EmbedBuilder()
            .setColor('#ff0000')
            .setDescription('❌ User not found.')
            .setTimestamp();
        return message.reply({ embeds: [embed] });
    }

    if (user.badgeVisibility) {
        const embed = new EmbedBuilder()
            .setColor('#fba700')
            .setDescription('ℹ️ Badge visibility is already enabled.')
            .setTimestamp();
        return message.reply({ embeds: [embed] });
    }

    await users.updateUser(userId, { badgeVisibility: true });

    const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setDescription('✅ Badges are now visible in calls!')
        .setTimestamp();
    message.reply({ embeds: [embed] });
}

async function handleBadgeDisable(message, users) {
    const userId = message.author.id;
    const user = await users.getUser(userId);

    if (!user) {
        const embed = new EmbedBuilder()
            .setColor('#ff0000')
            .setDescription('❌ User not found.')
            .setTimestamp();
        return message.reply({ embeds: [embed] });
    }

    if (!user.badgeVisibility) {
        const embed = new EmbedBuilder()
            .setColor('#fba700')
            .setDescription('ℹ️ Badge visibility is already disabled.')
            .setTimestamp();
        return message.reply({ embeds: [embed] });
    }

    await users.updateUser(userId, { badgeVisibility: false });

    const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setDescription('✅ Badges are now hidden in calls!')
        .setTimestamp();
    message.reply({ embeds: [embed] });
}

async function handleBadgeView(message, users, badgesModule) {
    const userId = message.author.id;
    const user = await users.getUser(userId);

    if (!user) {
        const embed = new EmbedBuilder()
            .setColor('#ff0000')
            .setDescription('❌ User not found.')
            .setTimestamp();
        return message.reply({ embeds: [embed] });
    }

    const badgeEmojis = badgesModule.formatBadges(user.badges);
    const badgeCount = user.badges.length;
    const visibilityText = user.badgeVisibility ? '✅ Visible in calls' : '❌ Hidden in calls';

    const container = new ContainerBuilder()
        .setAccentColor(0xfba700)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent('## 🏆 Your Badges')
        )
        .addSeparatorComponents(
            new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                badgeCount > 0
                    ? `${badgeEmojis}\n\n**${badgeCount}** badge${badgeCount !== 1 ? 's' : ''} total`
                    : 'You do not have any badges yet.'
            )
        )
        .addSeparatorComponents(
            new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small)
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`**Visibility:** ${visibilityText}\nUse \`f.be\` or \`f.bd\` to toggle.`)
        );

    message.reply({
        components: [container],
        flags: MessageFlags.IsComponentsV2
    });
}

async function handleHelp(message) {
    const sep = () => new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small);

    const container = new ContainerBuilder()
        .setAccentColor(0xfba700)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent('## 🌿 FernBot Commands')
        )
        .addSeparatorComponents(sep())
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                '### 📞 Calls\n' +
                '`f.call` / `f.c` - Join the queue to connect with a random server\n' +
                '`f.hangup` / `f.h` - End the current call\n' +
                '`f.skip` / `f.s` - End the current call and find a new match right away\n' +
                '`f.reconnect` / `f.rc` - Request to reconnect with your last call partner\n' +
                '`f.accept` / `f.a` - Accept a reconnect request\n' +
                '`f.decline` / `f.r` - Decline a reconnect request'
            )
        )
        .addSeparatorComponents(sep())
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                '### 👤 Profile\n' +
                '`f.friend` / `f.fr` - Share your username with your current call partner\n' +
                '`f.profile` / `f.p` - View your profile\n' +
                '`f.tier` - View your own tier\n' +
                '`f.tier <user>` - View anyone\'s tier\n' +
                '`f.heat` - View your current heat level\n' +
                '`f.stats` - View bot-wide statistics'
            )
        )
        .addSeparatorComponents(sep())
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                '### 🏆 Badges\n' +
                '`f.be` - Show your badges in calls\n' +
                '`f.bd` - Hide your badges in calls\n' +
                '`f.bv` - View your badges'
            )
        )
        .addSeparatorComponents(sep())
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                '### 🚩 Reporting\n' +
                '`f.report` - Reply to a message during a call to report it\n' +
                'Right-click a message -> Apps -> **Report Message** to report with a reason\n' +
                '`f.rep <user> +1/-1` - Give or remove reputation (staff only)'
            )
        )
        .addSeparatorComponents(sep())
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                '### 🔥 Heat System\n' +
                'Heat tracks your warning level. If it goes above 100, you cannot start or join calls until it cools down. Heat drops by 1 point every 30 minutes on its own.'
            )
        )
        .addSeparatorComponents(sep())
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                '### ⭐ Tier System\n' +
                '`Tier 0` - Text only\n' +
                '`Tier 1` - Text + Stickers\n' +
                '`Tier 2` - Text + Stickers + GIFs + Emoji\n' +
                '`Tier 3` - Everything above + File Attachments\n\n' +
                '-# When you use `f.call`, your channel joins a queue. When another server calls, you get matched and can chat anonymously!'
            )
        );

    message.reply({
        components: [container],
        flags: MessageFlags.IsComponentsV2
    });
}

async function handleStats(message, usersModule) {
    try {
        const allUsers = await usersModule.loadUsers();
        const allCalls = await calls.loadCalls();

        const registeredUsers = Object.keys(allUsers).length;

        const guildsSet = new Set();
        for (const callId in allCalls) {
            const call = allCalls[callId];
            guildsSet.add(call.guild1Id);
            guildsSet.add(call.guild2Id);
        }
        const registeredServers = guildsSet.size;
        const activeCalls = await calls.getAllActiveCalls().length;

        let totalMessagesSent = 0;
        for (const userId in allUsers) {
            totalMessagesSent += allUsers[userId].msgsent || 0;
        }

        const totalCalls = Object.keys(allCalls).length;

        const container = new ContainerBuilder()
            .setAccentColor(0xfba700)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent('## 📊 FernBot Statistics')
            )
            .addSeparatorComponents(
                new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
            )
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `👥 **Registered Users** ${registeredUsers}\n` +
                    `🏠 **Registered Servers** ${registeredServers}\n` +
                    `📞 **Active Calls** ${activeCalls}\n` +
                    `💬 **Total Messages Sent** ${totalMessagesSent}\n` +
                    `📋 **Total Calls** ${totalCalls}`
                )
            );

        message.reply({
            components: [container],
            flags: MessageFlags.IsComponentsV2
        });

    } catch (error) {
        console.error('Error fetching stats:', error);
        const embed = new EmbedBuilder()
            .setColor('#ff0000')
            .setDescription('❌ Failed to fetch statistics.')
            .setTimestamp();
        message.reply({ embeds: [embed] });
    }
}

async function handleReconnect(message, displayName) {
    const channelId = message.channel.id;

    const lastCall = await calls.getLastEndedCall(channelId);
    if (!lastCall) {
        const embed = new EmbedBuilder()
            .setColor('#ff0000')
            .setDescription('❌ No recent call to reconnect with (5 minute window expired).')
            .setTimestamp();
        return message.reply({ embeds: [embed] });
    }

    const otherChannelId = calls.getOtherChannelId(lastCall.callId, channelId);
    if (!otherChannelId) {
        const embed = new EmbedBuilder()
            .setColor('#ff0000')
            .setDescription('❌ Could not determine call partner.')
            .setTimestamp();
        return message.reply({ embeds: [embed] });
    }

    const pendingRequest = calls.getPendingReconnectRequest(lastCall.callId);
    if (pendingRequest) {
        if (pendingRequest.requesterChannelId === channelId) {
            const embed = new EmbedBuilder()
                .setColor('#fba700')
                .setDescription('⏳ Reconnect request already sent. Waiting for response...')
                .setTimestamp();
            return message.reply({ embeds: [embed] });
        }
        return handleAccept(message);
    }

    calls.setPendingReconnectRequest(lastCall.callId, message.author.id, displayName, channelId);

    try {
        const partnerChannel = await message.client.channels.fetch(otherChannelId);
        const requestEmbed = new EmbedBuilder()
            .setColor('#fba700')
            .setTitle('📥 Reconnect Request')
            .setDescription(`**${displayName}** wants to reconnect...\n\nSend \`f.accept\` to reconnect or \`f.decline\` to decline the request.`)
            .setTimestamp();

        await partnerChannel.send({ embeds: [requestEmbed] });

        const confirmEmbed = new EmbedBuilder()
            .setColor('#00ff00')
            .setDescription('✅ Reconnect request sent! Waiting for response...')
            .setTimestamp();
        message.reply({ embeds: [confirmEmbed] });

        const timeoutId = setTimeout(() => {
            calls.clearPendingReconnectRequest(lastCall.callId);
        }, 30000);

        calls.setReconnectTimer(lastCall.callId, timeoutId);

    } catch (error) {
        console.error('Error sending reconnect request:', error);
        calls.clearPendingReconnectRequest(lastCall.callId);
        const embed = new EmbedBuilder()
            .setColor('#ff0000')
            .setDescription('❌ Failed to send reconnect request.')
            .setTimestamp();
        message.reply({ embeds: [embed] });
    }
}

async function handleAccept(message) {
    const channelId = message.channel.id;

    const lastCall = await calls.getLastEndedCall(channelId);
    if (!lastCall) {
        const embed = new EmbedBuilder()
            .setColor('#ff0000')
            .setDescription('❌ No pending reconnect request.')
            .setTimestamp();
        return message.reply({ embeds: [embed] });
    }

    const pendingRequest = calls.getPendingReconnectRequest(lastCall.callId);
    if (!pendingRequest) {
        const embed = new EmbedBuilder()
            .setColor('#ff0000')
            .setDescription('❌ No pending reconnect request.')
            .setTimestamp();
        return message.reply({ embeds: [embed] });
    }

    calls.clearReconnectTimer(lastCall.callId);
    calls.clearPendingReconnectRequest(lastCall.callId);

    try {
        const channel1 = await message.client.channels.fetch(lastCall.channel1Id);
        const channel2 = await message.client.channels.fetch(lastCall.channel2Id);

        await connectChannels(channel1, channel2, lastCall.callId);

        await calls.reactiveCall(lastCall.callId);

        channel1.send({ embeds: [createConnectedEmbed(channel2.guild.name)] });
        channel2.send({ embeds: [createConnectedEmbed(channel1.guild.name)] });

    } catch (error) {
        console.error('Error reconnecting:', error);
        const embed = new EmbedBuilder()
            .setColor('#ff0000')
            .setDescription('❌ Failed to reconnect.')
            .setTimestamp();
        message.reply({ embeds: [embed] });
    }
}

async function handleDecline(message) {
    const channelId = message.channel.id;

    const lastCall = await calls.getLastEndedCall(channelId);
    if (!lastCall) {
        const embed = new EmbedBuilder()
            .setColor('#ff0000')
            .setDescription('❌ No pending reconnect request.')
            .setTimestamp();
        return message.reply({ embeds: [embed] });
    }

    const pendingRequest = calls.getPendingReconnectRequest(lastCall.callId);
    if (!pendingRequest) {
        const embed = new EmbedBuilder()
            .setColor('#ff0000')
            .setDescription('❌ No pending reconnect request.')
            .setTimestamp();
        return message.reply({ embeds: [embed] });
    }

    calls.clearReconnectTimer(lastCall.callId);
    calls.clearPendingReconnectRequest(lastCall.callId);

    try {
        const requesterChannelId = pendingRequest.requesterChannelId;
        const requesterChannel = await message.client.channels.fetch(requesterChannelId);

        const declinedEmbed = new EmbedBuilder()
            .setColor('#ff0000')
            .setDescription('❌ Your reconnect request was declined.')
            .setTimestamp();

        requesterChannel.send({ embeds: [declinedEmbed] });

        const confirmEmbed = new EmbedBuilder()
            .setColor('#00ff00')
            .setDescription('✅ Reconnect request declined.')
            .setTimestamp();
        message.reply({ embeds: [confirmEmbed] });

    } catch (error) {
        console.error('Error declining reconnect:', error);
    }
}

async function handleProfile(message, displayName, users, badgesModule) {
    const userId = message.author.id;
    const user = await users.getUser(userId);

    if (!user) {
        const embed = new EmbedBuilder()
            .setColor('#ff0000')
            .setDescription('❌ User not found.')
            .setTimestamp();
        return message.reply({ embeds: [embed] });
    }

    try {
        const fetchedUser = await message.client.users.fetch(userId, { force: true });
        const pfp = fetchedUser.displayAvatarURL({ size: 256, dynamic: true });
        const banner = fetchedUser.bannerURL({ size: 512, dynamic: true });

        const badgeEmojis = badgesModule.formatBadges(user.badges);
        const badgeDisplay = user.badges.length > 0 ? badgeEmojis : 'No badges yet';

        const userLevel = user.level || 0;
        const xpProgress = levels.getXpProgress(user.xp || 0);
        const heat = user.heat || 0;
        const rep = user.reputation || 0;

        // Profile section: display name + stats next to avatar thumbnail
        const profileSection = new SectionBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`## ${displayName}`),
                new TextDisplayBuilder().setContent(
                    `**Level** ${userLevel}  |  **XP** ${xpProgress.current} / ${xpProgress.needed}\n` +
                    `**Tier** ${user.tier}  |  **Messages Sent** ${user.msgsent}`
                ),
                new TextDisplayBuilder().setContent(
                    `**Heat** ${heat}${heat > 100 ? ' (restricted)' : ''}  |  **Reputation** ${rep >= 0 ? '+' + rep : rep}`
                )
            )
            .setThumbnailAccessory(
                new ThumbnailBuilder().setURL(pfp).setDescription(`${displayName}'s avatar`)
            );

        const separator = new SeparatorBuilder()
            .setDivider(true)
            .setSpacing(SeparatorSpacingSize.Small);

        const badgeSection = new TextDisplayBuilder()
            .setContent(`**Badges**\n${badgeDisplay}`);

        const container = new ContainerBuilder()
            .setAccentColor(0xfba700)
            .addSectionComponents(profileSection)
            .addSeparatorComponents(separator)
            .addTextDisplayComponents(badgeSection);

        // If user has a banner, add it as a media gallery at the bottom
        if (banner) {
            container.addSeparatorComponents(
                new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small)
            );
            container.addMediaGalleryComponents(
                new MediaGalleryBuilder().addItems(
                    new MediaGalleryItemBuilder().setURL(banner).setDescription(`${displayName}'s banner`)
                )
            );
        }

        message.reply({
            components: [container],
            flags: MessageFlags.IsComponentsV2
        });

    } catch (error) {
        console.error('Error fetching profile:', error);
        const embed = new EmbedBuilder()
            .setColor('#ff0000')
            .setDescription('❌ Failed to fetch profile.')
            .setTimestamp();
        message.reply({ embeds: [embed] });
    }
}

async function handleReport(message, args, reportsModule) {
    const channelId = message.channel.id;
    const connection = activeConnections.get(channelId);

    if (!connection) {
        const embed = new EmbedBuilder()
            .setColor('#ff0000')
            .setDescription('❌ You can only report messages during an active call!')
            .setTimestamp();
        return message.reply({ embeds: [embed] });
    }

    if (!message.reference) {
        const embed = new EmbedBuilder()
            .setColor('#ff0000')
            .setDescription('❌ Please reply to a message with `f.report` to report it.')
            .setTimestamp();
        return message.reply({ embeds: [embed] });
    }

    try {
        const reportedMessage = await message.channel.messages.fetch(message.reference.messageId);

        if (!reportedMessage) {
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setDescription('❌ Could not find the message you are trying to report.')
                .setTimestamp();
            return message.reply({ embeds: [embed] });
        }

        const success = await reportsModule.sendMessageReport(
            message.client,
            reportedMessage.author.id,
            message.author.id,
            reportedMessage.content || '*[No text content]*'
        );

        if (success) {
            const embed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle('✅ Report Submitted')
                .setDescription('Your report has been submitted.')
                .setTimestamp();
            message.reply({ embeds: [embed] });
        } else {
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setDescription('❌ Failed to submit report.')
                .setTimestamp();
            message.reply({ embeds: [embed] });
        }
    } catch (error) {
        console.error('Error handling report:', error);
    }
}

async function handleHeat(message, args, heatModule, moderators, admins = []) {
    const userId = message.author.id;
    const isModerator = moderators.includes(userId) || admins.includes(userId);

    if (args.length === 0) {
        const heatData = await heatModule.getUserHeat(userId);
        const embed = new EmbedBuilder()
            .setColor('#ff6600')
            .setTitle('🔥 Your Heat Level')
            .addFields(
                { name: 'Heat', value: heatData.heat.toString(), inline: true },
                { name: 'Status', value: heatData.heat > 100 ? '🚫 Restricted' : '✅ Normal', inline: true }
            )
            .setFooter({ text: 'Heat decays at 1 point every 30 minutes.' })
            .setTimestamp();
        return message.reply({ embeds: [embed] });
    }

    if (!isModerator) {
        const embed = new EmbedBuilder()
            .setColor('#ff0000')
            .setDescription('❌ You do not have permission to modify heat.')
            .setTimestamp();
        return message.reply({ embeds: [embed] });
    }

    const subCommand = args[0].toLowerCase();
    const targetId = args[1];
    const amount = parseInt(args[2]);

    if (subCommand === 'add' && targetId && !isNaN(amount)) {
        const newHeat = await heatModule.modifyHeat(targetId, amount, message.client);
        const embed = new EmbedBuilder()
            .setColor('#ff6600')
            .setDescription(`✅ Added ${amount} heat to <@${targetId}>. New heat: ${newHeat}`)
            .setTimestamp();
        message.reply({ embeds: [embed] });
    } else if (subCommand === 'remove' && targetId && !isNaN(amount)) {
        const newHeat = await heatModule.modifyHeat(targetId, -amount, message.client);
        const embed = new EmbedBuilder()
            .setColor('#00ff00')
            .setDescription(`✅ Removed ${amount} heat from <@${targetId}>. New heat: ${newHeat}`)
            .setTimestamp();
        message.reply({ embeds: [embed] });
    } else if (subCommand === 'check' && targetId) {
        const heatData = await heatModule.getUserHeat(targetId);
        const embed = new EmbedBuilder()
            .setColor('#ff6600')
            .setTitle(`🔥 Heat for <@${targetId}>`)
            .addFields(
                { name: 'Heat', value: heatData.heat.toString(), inline: true },
                { name: 'Status', value: heatData.heat > 100 ? '🚫 Restricted' : '✅ Normal', inline: true }
            )
            .setTimestamp();
        message.reply({ embeds: [embed] });
    }
}

async function handleTier(message, args, usersModule, moderators, admins = []) {
    const userId = message.author.id;
    const isAdmin = admins.includes(userId);

    // f.tier — view own tier
    if (args.length === 0) {
        const user = await usersModule.getUser(message.author.id);
        if (!user) {
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setDescription('❌ User not found.')
                .setTimestamp();
            return message.reply({ embeds: [embed] });
        }
        const embed = new EmbedBuilder()
            .setColor('#fba700')
            .setTitle('⭐ Your Tier')
            .setDescription(`Your current tier is **${user.tier}**`)
            .setTimestamp();
        return message.reply({ embeds: [embed] });
    }

    // Resolve target user ID from mention or raw ID
    const targetArg = args[0];
    const targetId = targetArg.replace(/[<@!>]/g, '');
    const subCommand = args[1]?.toLowerCase();

    // f.tier <user> set <tier> — mod only
    if (subCommand === 'set') {
        if (!isAdmin) {
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setDescription('❌ Only admins can set tiers.')
                .setTimestamp();
            return message.reply({ embeds: [embed] });
        }

        const newTier = parseInt(args[2]);
        if (isNaN(newTier) || newTier < 0 || newTier > 3) {
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setDescription('❌ Invalid tier. Must be a number between 0 and 3.')
                .setTimestamp();
            return message.reply({ embeds: [embed] });
        }

        const updated = await await usersModule.updateUser(targetId, { tier: newTier });
        if (!updated) {
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setDescription('❌ User not found.')
                .setTimestamp();
            return message.reply({ embeds: [embed] });
        }

        const embed = new EmbedBuilder()
            .setColor('#00ff00')
            .setDescription(`✅ Set tier of <@${targetId}> to **${newTier}**`)
            .setTimestamp();

        notify.sendTierChangeNotification(message.client, targetId, newTier).catch(() => {});

        return message.reply({ embeds: [embed] });
    }

    // f.tier <user> — view anyone's tier
    const target = await usersModule.getUser(targetId);
    if (!target) {
        const embed = new EmbedBuilder()
            .setColor('#ff0000')
            .setDescription('❌ User not found.')
            .setTimestamp();
        return message.reply({ embeds: [embed] });
    }

    const embed = new EmbedBuilder()
        .setColor('#fba700')
        .setTitle('⭐ Tier')
        .setDescription(`<@${targetId}>'s current tier is **${target.tier}**`)
        .setTimestamp();
    message.reply({ embeds: [embed] });
}

async function handleRep(message, args, usersModule, moderators, admins = []) {
    const userId = message.author.id;
    const isStaff = moderators.includes(userId) || admins.includes(userId);

    if (!isStaff) {
        const embed = new EmbedBuilder()
            .setColor('#ff0000')
            .setDescription('❌ You do not have permission to give reputation.')
            .setTimestamp();
        return message.reply({ embeds: [embed] });
    }

    if (args.length < 2) {
        const embed = new EmbedBuilder()
            .setColor('#ff0000')
            .setDescription('❌ Usage: `f.rep <userid or @user> +1/-1`')
            .setTimestamp();
        return message.reply({ embeds: [embed] });
    }

    const targetId = args[0].replace(/[<@!>]/g, '');
    const change = args[1];

    if (change !== '+1' && change !== '-1') {
        const embed = new EmbedBuilder()
            .setColor('#ff0000')
            .setDescription('❌ Rep change must be `+1` or `-1`.')
            .setTimestamp();
        return message.reply({ embeds: [embed] });
    }

    const target = await usersModule.getUser(targetId);
    if (!target) {
        const embed = new EmbedBuilder()
            .setColor('#ff0000')
            .setDescription('❌ User not found.')
            .setTimestamp();
        return message.reply({ embeds: [embed] });
    }

    const amount = change === '+1' ? 1 : -1;
    const currentRep = target.reputation || 0;
    const newRep = currentRep + amount;
    await usersModule.updateUser(targetId, { reputation: newRep });

    const embed = new EmbedBuilder()
        .setColor(amount > 0 ? '#00ff00' : '#ff0000')
        .setDescription(`${amount > 0 ? '✅ +1' : '❌ -1'} reputation for <@${targetId}>. New reputation: **${newRep}**`)
        .setTimestamp();
    message.reply({ embeds: [embed] });
}

async function connectChannels(channel1, channel2, callId) {
    const webhook1 = await channel1.createWebhook({ name: 'FernBot Relay' });
    const webhook2 = await channel2.createWebhook({ name: 'FernBot Relay' });

    activeConnections.set(channel1.id, {
        partnerChannelId: channel2.id,
        webhook: webhook1,
        partnerWebhook: webhook2,
        channel: channel1,
        callId: callId
    });

    activeConnections.set(channel2.id, {
        partnerChannelId: channel1.id,
        webhook: webhook2,
        partnerWebhook: webhook1,
        channel: channel2,
        callId: callId
    });
}

module.exports = {
    handleCall,
    handleHangup,
    handleSkip,
    handleFriend,
    handleBadgeEnable,
    handleBadgeDisable,
    handleBadgeView,
    handleHelp,
    handleStats,
    handleReconnect,
    handleAccept,
    handleDecline,
    handleProfile,
    handleReport,
    handleHeat,
    handleTier,
    handleRep,
    createAcceptTermsEmbed,
    createAcceptButton,
    activeConnections
};
