# FernBot — Project Documentation

## Overview
FernBot is a Discord bot that anonymously connects channels across different servers, allowing users to chat with strangers (similar to Omegle but for Discord servers). Users send messages in their channel, which are relayed via webhooks to a matched partner channel.

---

## File Structure

```
fernbot/
├── fern.js                        # Entry point, Discord client, event handlers
├── ping.js                        # Keep-alive HTTP server + mutual ping
├── package.json                   # Dependencies
├── configdata.json                # Consolidated config — admins, moderators, badges, blacklists (GitHub)
├── managers/
│   ├── db.js                      # Turso client + initDB() table setup
│   ├── badges.js                  # Badge emoji loading & formatting
│   ├── blacklists.js              # User/guild/word blacklist logic (file-based)
│   ├── users.js                   # User CRUD via Turso
│   └── status.js                  # Bot status rotation
└── systems/
    ├── cmds.js                    # All command handlers + Components V2 embeds
    ├── calls.js                   # Call/matching logic, reconnect system via Turso
    ├── reports.js                 # Report submission (message, call, context menu)
    ├── heat.js                    # Heat system logic via Turso
    ├── levels.js                  # XP + level system
    └── notify.js                  # DM notifications (heat increase, tier change)
```

**Note:** `data/` folder is no longer used — all user and call data lives in Turso.

---

## Bot Identity
- **Name:** FernBot
- **Prefix:** `f.`
- **Theme:** Nature / forest 🌿
- **Fallback display name:** `Fern User`

---

## Commands

| Command         | Aliases  | Description                                      | Heat-gated? |
|-----------------|----------|--------------------------------------------------|-------------|
| `f.call`        | `f.c`    | Start looking for a match                        | ✅           |
| `f.hangup`      | `f.h`    | End current call                                 | ✅           |
| `f.skip`        | `f.s`    | Skip current match and find a new one            | ✅           |
| `f.friend`      | `f.fr`   | Send a friend request to current match           | ✅           |
| `f.reconnect`   | `f.rc`   | Reconnect with last matched partner              | ✅           |
| `f.accept`      | `f.a`    | Accept an incoming reconnect request             | ✅           |
| `f.decline`     | `f.r`    | Decline an incoming request                      | ✅           |
| `f.profile`     | `f.p`    | View your profile                                | ❌           |
| `f.stats`       | —        | View bot-wide stats                              | ❌           |
| `f.heat`        | —        | View your heat level                             | ❌           |
| `f.heat add/remove/check` | — | Mod: adjust/check another user's heat        | ❌           |
| `f.report`      | —        | Reply to a message to report it                  | ❌           |
| `f.tier`        | —        | View your own tier                               | ❌           |
| `f.tier <user>` | —        | View anyone's tier                               | ❌           |
| `f.tier <user> set <0-3>` | — | Mod: set a user's tier                      | ❌           |
| `f.rep <user> +1/-1` | — | Mod/Admin: give or remove reputation | ❌ |
| `f.be`          | —        | Enable badge visibility                          | ❌           |
| `f.bd`          | —        | Disable badge visibility                         | ❌           |
| `f.bv`          | —        | View your badges                                 | ❌           |

---

## User Object (current, file-based — `data/users.json`)

```json
{
  "userID": "string",
  "username": "string",
  "accepted": "boolean",
  "tier": "number (0-3)",
  "badges": ["badgeId", "..."],
  "badgeVisibility": "boolean",
  "msgsent": "number",
  "heat": "number",
  "lastDecay": "timestamp (ms)",
  "reputation": "number (can be negative)",
  "xp": "number",
  "level": "number"
}
```

---

## Tier System

| Tier | Content Allowed             |
|------|-----------------------------|
| 0    | Text only                   |
| 1    | Text + Stickers             |
| 2    | Text + Stickers + GIFs      |
| 3    | Text + Stickers + GIFs + Attachments |

---

## Level System
- **XP per message:** random 10-20, granted only on relayed messages (in active calls)
- **Cooldown:** 1 second per user (in-memory, resets on restart)
- **Formula:** `XP required for level N = 100 * (N ^ 1.2)`
- **Level up:** DM sent to user with new level and XP progress
- **No rewards** for now — purely visual stat shown on profile and dashboard

---
- Heat is a per-user numeric value
- Threshold: **> 100** blocks matching commands
- Decay: **1 point every 30 minutes**
- Moderators can manually adjust heat

---

## Staff Hierarchy

| Role  | Permissions                                              |
|-------|----------------------------------------------------------|
| Admin | Set tiers + all mod powers (heat add/remove/check)       |
| Mod   | Heat add/remove/check only                               |
| User  | All regular commands                                     |

- Admin IDs stored in `configdata.json` under `admins`
- Mod IDs stored in `configdata.json` under `moderators`
- Admins are treated as mods everywhere — no need to add them to both lists

---

## Message Relay Flow
1. User sends a message in a connected channel
2. Bot checks: user blacklisted? guild blacklisted? terms accepted?
3. Checks content: banned words → block; blacklisted words → censor; disallowed links → block; mentions → sanitize
4. Checks tier against content type (stickers, GIFs, attachments)
5. Relays via partner webhook with privacy-safe display name
6. Increments user message count

---

## Content Filters
- **Banned words** → message blocked entirely
- **Blacklisted words** → replaced with `[REDACTED]`
- **Mentions** → `@everyone` / `@here` escaped
- **Links** → only Discord CDN attachments, Tenor, Klipy, and Discord emojis allowed

---

## Call Object (current, file-based — `data/calls.json`)

```json
{
  "callId": "string (call_<timestamp>_<random>)",
  "channel1Id": "string",
  "channel2Id": "string",
  "guild1Id": "string",
  "guild2Id": "string",
  "startTime": "timestamp (ms)",
  "endTime": "timestamp (ms) | null",
  "status": "active | ended",
  "messages": "number",
  "reconnectWindow": "timestamp (ms) | null"
}
```

### Reconnect System
- On `endCall`, a **5-minute reconnect window** is set
- Either party can send `f.reconnect` within the window
- The other party gets a request; they `f.accept` or `f.decline`
- Pending requests and timers tracked **in-memory** (Maps), not persisted

---

## Bot Status Rotation
Rotates every N seconds (default: 5s). Statuses:
- `Send f.help`
- `Made with 💚 by Nova`
- `In X servers` *(dynamic server count)*
- `FernBot`
- `Bridging communities 🌿`
- `Leaf it to chance`
- `Powered by Spite and Rage`

---

## Embed Color Palette

| Color     | Hex       | Usage                              |
|-----------|-----------|------------------------------------|
| Amber     | `#fba700` | Searching, warnings, info, profile |
| Green     | `#00ff00` | Success, connected, accepted       |
| Red       | `#ff0000` | Errors, call ended, reports        |
| Orange    | `#ff6600` | Heat notifications                 |
| Blurple   | `#5865F2` | Reply-to embeds                    |

---

## Matching / Queue System
- In-memory queue array: `[{ channelId, guildId, channel }]`
- On `f.call`: if queue has an entry → match immediately; else → push to queue
- On match: two webhooks created (one per channel), stored in `activeConnections` Map
- `activeConnections` Map: `channelId → { partnerChannelId, webhook, partnerWebhook, channel, callId }`
- Queue and `activeConnections` are **in-memory only** — reset on bot restart

---

## Report Types

| Type            | Trigger                           | Fields                                                      |
|-----------------|-----------------------------------|-------------------------------------------------------------|
| Message report  | `f.report` (reply to message)     | reportedUserId, reporterUserId, messageContent              |
| Context menu    | Right-click → "Report Message"    | reportedUserTag, messageId, reporterTag, reason             |
| Call report     | `sendCallReport()` (no UI trigger yet) | reporterTag, reporterChannelId, reportedChannelId, reason |

All reports post to hardcoded Discord channel: `REPORT_CHANNEL_ID = '1442295618025295974'`

---

## Turso Migration (Planned)

**Why Turso:** SQLite-based (libSQL), good free tier (9GB, 500 DBs), faster latency than Supabase for a persistent Node.js bot. Reports stay in Discord (only user ID needed to act), so no dashboard requirement.

**Scope:** Only `data/users.json` and `data/calls.json` migrate to Turso. `configdata.json` stays file-based on GitHub (rarely changes).

### Tables

#### `users`
| Column           | Type     | Notes                          |
|------------------|----------|--------------------------------|
| user_id          | TEXT (PK)| Discord user ID                |
| username         | TEXT     |                                |
| accepted         | INTEGER  | Boolean as 0/1 (SQLite)        |
| tier             | INTEGER  | 0–3                            |
| badges           | TEXT     | JSON array stored as string    |
| badge_visibility | INTEGER  | Boolean as 0/1                 |
| msgsent          | INTEGER  | Total messages relayed         |
| heat             | INTEGER  | Current heat value             |
| last_decay       | INTEGER  | Unix timestamp ms              |
| reputation       | INTEGER  | Can be negative; purely visual |
| xp               | INTEGER  | Total XP earned                |
| level            | INTEGER  | Derived from XP via formula    |
| created_at       | INTEGER  | Unix timestamp ms, auto        |

#### `calls`
| Column           | Type     | Notes                              |
|------------------|----------|------------------------------------|
| call_id          | TEXT (PK)| e.g. `call_<ts>_<rand>`            |
| channel1_id      | TEXT     | Discord channel ID                 |
| channel2_id      | TEXT     | Discord channel ID                 |
| guild1_id        | TEXT     |                                    |
| guild2_id        | TEXT     |                                    |
| start_time       | INTEGER  | Unix timestamp ms                  |
| end_time         | INTEGER  | Nullable                           |
| status           | TEXT     | `active` or `ended`                |
| messages         | INTEGER  | Messages relayed in call           |
| reconnect_window | INTEGER  | Nullable; endTime + 5min           |

> **Note:** `blacklists` stays in `configdata.json` on GitHub — it's manually managed and rarely touched. `reports` stay in Discord channel — only user ID is needed to act on them.

---

## Hosting Plan (Beta)
| What              | Where                                                  |
|-------------------|--------------------------------------------------------|
| Source code       | GitHub (bot repo)                                      |
| `configdata.json` | GitHub (file-based, rarely changes)                    |
| Database          | Turso (us-west-2, Oregon)                              |
| Bot process       | Render (persistent Node.js + mutual keep-alive pings)  |
| Dashboard         | Vercel (Next.js, separate repo)                        |
| Production (later)| Oracle Cloud                                           |

---

## Environment Variables

### Bot (Render)
| Variable           | Description                                |
|--------------------|--------------------------------------------|
| `FERN_TOKEN`       | Discord bot token                          |
| `TURSO_URL`        | `libsql://fernbot-beta-julie.aws-us-west-2.turso.io` |
| `TURSO_TOKEN`      | Turso auth token                           |
| `PARTNER_PING_URL` | Friend's Render URL for mutual keep-alive  |

### Dashboard (Vercel)
| Variable               | Description                          |
|------------------------|--------------------------------------|
| `NEXTAUTH_SECRET`      | Random secret for next-auth          |
| `NEXTAUTH_URL`         | Dashboard Vercel URL                 |
| `DISCORD_CLIENT_ID`    | From Discord Developer Portal        |
| `DISCORD_CLIENT_SECRET`| From Discord Developer Portal        |
| `TURSO_URL`            | Same as bot                          |
| `TURSO_TOKEN`          | Same as bot                          |
| `RENDER_PING_URL`      | Bot's Render URL for keep-alive ping |

---
