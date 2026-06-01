require('dotenv').config();
require('./ping');

const { Client, GatewayIntentBits, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const users = require('./managers/users');
const badges = require('./managers/badges');
const blacklists = require('./managers/blacklists');
const cmds = require('./systems/cmds');
const calls = require('./systems/calls');
const status = require('./managers/status');
const reports = require('./systems/reports');
const heat = require('./systems/heat');
const levels = require('./systems/levels');
const fs = require('fs');
const path = require('path');

// Load config
const CONFIG_FILE = path.join(__dirname, 'configdata.json');
function loadModerators() {
    try {
        const data = fs.readFileSync(CONFIG_FILE, 'utf8');
        return JSON.parse(data).moderators || [];
    } catch (error) {
        return [];
    }
}
function loadAdmins() {
    try {
        const data = fs.readFileSync(CONFIG_FILE, 'utf8');
        return JSON.parse(data).admins || [];
    } catch (error) {
        return [];
    }
}
const moderators = loadModerators();
const admins = loadAdmins();

const PREFIX = 'f.';

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildWebhooks,
        GatewayIntentBits.GuildMembers
    ]
});

const { initDB } = require('./managers/db');

client.once('clientReady', async () => {
    await initDB();
    console.log(`✅ Fern is online! Logged in as ${client.user.tag}`);
    console.log(`🌿 Bot is ready to match channels across servers!`);
    status.startStatusRotation(client, 5);
});

client.on('interactionCreate', async (interaction) => {
    if (interaction.isButton()) {
        if (interaction.customId === 'accept_terms') {
            const userId = interaction.user.id;
            await users.acceptTerms(userId);

            const embed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle('✅ Terms Accepted')
                .setDescription('Thank you! You can now use FernBot.')
                .setTimestamp();

            await interaction.update({ embeds: [embed], components: [] });
        }
    } else if (interaction.isMessageContextMenuCommand()) {
        if (interaction.commandName === 'Report Message') {
            const modal = new ModalBuilder()
                .setCustomId('report_modal')
                .setTitle('Report Message');

            const reasonInput = new TextInputBuilder()
                .setCustomId('report_reason')
                .setLabel('Report Reason')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('Explain why you\'re reporting this message...')
                .setMinLength(10)
                .setMaxLength(500);

            const actionRow = new ActionRowBuilder().addComponents(reasonInput);
            modal.addComponents(actionRow);

            await interaction.showModal(modal);
        }
    } else if (interaction.isModalSubmit()) {
        if (interaction.customId === 'report_modal') {
            const reason = interaction.fields.getTextInputValue('report_reason');
            const reportedMessage = interaction.targetMessage;
            const reportedUser = reportedMessage.author;

            const success = await reports.sendReport(
                client,
                reportedUser.tag,
                reportedMessage.id,
                interaction.user.tag,
                reason
            );

            if (success) {
                const embed = new EmbedBuilder()
                    .setColor('#00ff00')
                    .setTitle('✅ Report Submitted')
                    .setDescription('Thank you for reporting this message. Our team will review it shortly.')
                    .setTimestamp();

                await interaction.reply({ embeds: [embed], ephemeral: true });
            } else {
                const embed = new EmbedBuilder()
                    .setColor('#ff0000')
                    .setTitle('❌ Report Failed')
                    .setDescription('Failed to submit your report. Please try again later.')
                    .setTimestamp();

                await interaction.reply({ embeds: [embed], ephemeral: true });
            }
        }
    }
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const userId = message.author.id;
    const username = message.author.username;

    let user = await users.getUser(userId);
    if (!user) {
        user = await users.createUser(userId, username);
    }

    if (blacklists.isUserBlacklisted(userId) || blacklists.isGuildBlacklisted(message.guild.id)) {
        return;
    }

    if (!message.content.startsWith(PREFIX)) {
        if (!user.accepted) return;
        await relayMessage(message, user);
        return;
    }

    if (!user.accepted) {
        const embed = cmds.createAcceptTermsEmbed();
        const button = cmds.createAcceptButton();
        return message.reply({ embeds: [embed], components: [button] });
    }

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // Check if user's heat is too high for calling/matching commands only
    // Utility commands (profile, stats, help, heat, etc) are always allowed
    const matchingCommands = ['call', 'c', 'hangup', 'h', 'skip', 's', 'friend', 'fr', 'reconnect', 'rc', 'accept', 'a', 'decline', 'r'];
    if (matchingCommands.includes(command) && await heat.isUserTooHot(userId)) {
        const embed = new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('🔥 Too Hot!')
            .setDescription('Your heat level is too high (>100). You cannot use calling commands until it cools down.\n\n*Heat decays at 1 point every 30 minutes.*')
            .setTimestamp();
        const reply = await message.reply({ embeds: [embed] });
        setTimeout(() => reply.delete().catch(() => {}), 5000);
        return;
    }

    try {
        switch (command) {
            case 'call':
            case 'c':
                await cmds.handleCall(message);
                break;
            case 'hangup':
            case 'h':
                await cmds.handleHangup(message);
                break;
            case 'skip':
            case 's':
                await cmds.handleSkip(message);
                break;
            case 'friend':
            case 'fr':
                const displayName = await getPrivacySafeDisplayName(message);
                await cmds.handleFriend(message, users, displayName);
                break;
            case 'be':
                await cmds.handleBadgeEnable(message, users);
                break;
            case 'bd':
                await cmds.handleBadgeDisable(message, users);
                break;
            case 'bv':
                await cmds.handleBadgeView(message, users, badges);
                break;
            case 'reconnect':
            case 'rc':
                const displayNameRc = await getPrivacySafeDisplayName(message);
                await cmds.handleReconnect(message, displayNameRc);
                break;
            case 'accept':
            case 'a':
                await cmds.handleAccept(message);
                break;
            case 'decline':
            case 'r':
                await cmds.handleDecline(message);
                break;
            case 'stats':
                await cmds.handleStats(message, users);
                break;
            case 'profile':
            case 'p':
                const displayNameProfile = await getPrivacySafeDisplayName(message);
                await cmds.handleProfile(message, displayNameProfile, users, badges);
                break;
            case 'heat':
                await cmds.handleHeat(message, args, heat, moderators, admins);
                break;
            case 'report':
                await cmds.handleReport(message, args, reports);
                break;
            case 'tier':
                await cmds.handleTier(message, args, users, moderators, admins);
                break;
            case 'rep':
                await cmds.handleRep(message, args, users, moderators, admins);
                break;
            case 'help':
            case 'hp':
                await cmds.handleHelp(message);
                break;
        }
    } catch (error) {
        console.error('Command error:', error);
        const embed = new EmbedBuilder()
            .setColor('#ff0000')
            .setDescription('❌ An error occurred while processing your command.')
            .setTimestamp();
        message.reply({ embeds: [embed] });
    }
});

async function getPrivacySafeDisplayName(message) {
    try {
        if (message.author.bot && message.webhookId) {
            return message.author.username;
        }

        let member = message.member;

        if (!member && message.guild) {
            member = await message.guild.members.fetch(message.author.id).catch(() => null);
        }

        if (member && member.nickname) {
            return member.nickname;
        }

        if (member && member.displayName !== message.author.username) {
            return member.displayName;
        }

        return 'Fern User';
    } catch (error) {
        console.error('Error getting display name:', error);
        return 'Fern User';
    }
}

function canRelayContent(user, message) {
    const tier = user.tier;
    const content = message.content || '';

    // Tier 1+ — stickers
    if (message.stickers.size > 0) {
        return tier >= 1;
    }

    // Tier 2+ — GIFs, emoji URLs, klipy
    const hasTier2Link = (
        content.includes('tenor.com/') ||
        content.includes('giphy.com/') ||
        content.includes('klipy.com/') ||
        content.includes('cdn.discordapp.com/emojis/') ||
        /\.gif(\?|$)/i.test(content)
    );
    if (hasTier2Link) {
        return tier >= 2;
    }

    // Tier 3+ — file attachments and Discord CDN attachment links
    if (message.attachments.size > 0) {
        return tier >= 3;
    }
    if (content.includes('cdn.discordapp.com/attachments/')) {
        return tier >= 3;
    }

    // Tier 0 — block any other links entirely
    const urlRegex = /(https?:\/\/[^\s]+)/gi;
    if (urlRegex.test(content)) {
        return tier >= 2;
    }

    return true;
}

// Extracts the first allowed link from content, returns null if none found
// or if any link in the content is disallowed
function extractAllowedLink(content) {
    if (!content) return null;
    const urlRegex = /(https?:\/\/[^\s]+)/gi;
    const links = content.match(urlRegex);
    if (!links) return null;
    const link = links[0];
    const isDiscordAttachment = link.startsWith('https://cdn.discordapp.com/attachments/');
    const isTenorLink = link.startsWith('https://tenor.com/view/');
    const isKlipyLink = link.startsWith('https://klipy.com/gifs/');
    const isDiscordEmoji = link.startsWith('https://cdn.discordapp.com/emojis/');
    if (!isDiscordAttachment && !isTenorLink && !isKlipyLink && !isDiscordEmoji) return null;
    return link;
}

async function relayMessage(message, user) {
    const channelId = message.channel.id;
    const connection = cmds.activeConnections.get(channelId);

    if (!connection || !connection.partnerWebhook) return;

    if (!canRelayContent(user, message)) {
        const embed = new EmbedBuilder()
            .setColor('#ff0000')
            .setDescription(`❌ Your tier (${user.tier}) doesn't allow sending this type of content.`)
            .setTimestamp();
        return message.reply({ embeds: [embed] });
    }

    // Check for banned words
    if (blacklists.containsBannedWords(message.content)) {
        const embed = new EmbedBuilder()
            .setColor('#ff0000')
            .setDescription('❌ Your message contains banned words and cannot be sent.')
            .setTimestamp();
        return message.reply({ embeds: [embed] });
    }

    // Check for disallowed links
    if (!blacklists.isLinkAllowed(message.content)) {
        const embed = new EmbedBuilder()
            .setColor('#ff0000')
            .setDescription('❌ Your message contains disallowed links. Only Discord attachments and Tenor GIF links are allowed.')
            .setTimestamp();
        return message.reply({ embeds: [embed] });
    }

    try {
        const displayName = await getPrivacySafeDisplayName(message);
        let messageContent = message.content || '';

        // Filter mentions
        messageContent = blacklists.filterMentions(messageContent);

        // Censor blacklisted words
        messageContent = blacklists.censorBlacklistedWords(messageContent);

        const attachments = message.attachments.size > 0 
            ? Array.from(message.attachments.values()).map(a => a.url).join('\n') 
            : '';

        const fullContent = messageContent + (attachments ? '\n' + attachments : '');

        // Extract allowed link from message content for image rendering
        const allowedLink = extractAllowedLink(messageContent);
        const textWithoutLink = allowedLink ? messageContent.replace(allowedLink, '').trim() : null;

        const isTextOrEmoji = !message.stickers.size && !attachments && !allowedLink && fullContent.trim();
        const badgeText = (isTextOrEmoji && user.badgeVisibility && user.badges.length > 0) 
            ? '\n' + badges.formatBadges(user.badges)
            : '';

        const embeds = [];

        // Reply embed
        if (message.reference) {
            try {
                const repliedMessage = await message.channel.messages.fetch(message.reference.messageId);
                const repliedDisplayName = await getPrivacySafeDisplayName(repliedMessage);
                const repliedLink = extractAllowedLink(repliedMessage.content);

                let replyDescription;
                if (repliedLink) {
                    const repliedTextWithoutLink = repliedMessage.content.replace(repliedLink, '').trim();
                    replyDescription = repliedTextWithoutLink
                        ? `${repliedTextWithoutLink}\n[attachment](${repliedLink})`
                        : `[attachment](${repliedLink})`;
                } else {
                    replyDescription = repliedMessage.content || '*[No text content]*';
                }

                const replyEmbed = new EmbedBuilder()
                    .setAuthor({
                        name: repliedDisplayName,
                        iconURL: repliedMessage.author.displayAvatarURL()
                    })
                    .setDescription(replyDescription)
                    .setColor('#5865F2');

                embeds.push(replyEmbed);
            } catch (error) {
                console.error('Error fetching replied message:', error);
            }
        }

        // Link-as-image embed
        if (allowedLink) {
            const linkEmbed = new EmbedBuilder()
                .setColor('#5865F2')
                .setImage(allowedLink);
            if (textWithoutLink) linkEmbed.setDescription(textWithoutLink);
            embeds.push(linkEmbed);
        }

        if (message.stickers.size > 0) {
            const sticker = message.stickers.first();
            await connection.partnerWebhook.send({
                content: `[Sticker: ${sticker.name}]\n${sticker.url}${badgeText}`,
                username: displayName,
                avatarURL: message.author.displayAvatarURL(),
                embeds: embeds
            });
        } else if (allowedLink) {
            // Send text (if any) as content, link renders via embed image
            await connection.partnerWebhook.send({
                content: textWithoutLink ? textWithoutLink + badgeText : badgeText || undefined,
                username: displayName,
                avatarURL: message.author.displayAvatarURL(),
                embeds: embeds
            });
        } else if (fullContent.trim() || embeds.length > 0) {
            await connection.partnerWebhook.send({
                content: fullContent + badgeText,
                username: displayName,
                avatarURL: message.author.displayAvatarURL(),
                embeds: embeds
            });
        }

        users.incrementMessageCount(user.userID);
        await levels.grantXp(user.userID, message.client);
    } catch (error) {
        console.error('Error relaying message:', error);
    }
}

const token = process.env.FERN_TOKEN;

if (!token) {
    console.error('❌ ERROR: FERN_TOKEN is not set!');
    console.log('Please set your Discord bot token in the Secrets tab.');
    process.exit(1);
}

client.login(token).catch(error => {
    console.error('❌ Failed to login:', error);
    process.exit(1);
});
