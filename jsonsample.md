# JSON Sample Reference

Sample data for all config/data JSON files used by FernBot. Use this as reference for structure, field types, and expected values.

---

## `configdata.json` *(consolidated config file — lives on GitHub)*

Previously split across `configdata/badges.json`, `configdata/blacklists.json`, and `configdata/moderators.json`. Now a single file for easier editing. The `"sep:"` keys are purely visual dividers — ignored by the code.

```json
{
  "admins": [
    "875703615099134013"
  ],
  "moderators": [
    "875703615099134013"
  ],
  "badges": {
    "owner": "<:Owner:1442289853793304687>",
    "developer": "💻",
    "supporter": "💚",
    "early_adopter": "🌱",
    "verified": "✅",
    "moderator": "🛡️",
    "premium": "⭐"
  },
  "blacklists": {
    "bannedUsers": [],
    "bannedServers": [],
    "bannedWords": [],
    "blacklistedWords": []
  }
}
```

**Notes:**
- `admins` — can set tiers + all mod powers; no need to also add to `moderators`
- `moderators` — heat add/remove/check only
- `badges` — badge ID → emoji; custom Discord emoji format: `<:name:id>`
- `blacklists.bannedUsers` / `bannedServers` — Discord IDs; messages/users blocked entirely
- `blacklists.bannedWords` — regex or plain strings; message blocked if matched
- `blacklists.blacklistedWords` — regex or plain strings; matched text replaced with `[REDACTED]`

---

## `data/calls.json`

Record of all calls (active and ended).

```json
{
  "call_1779383979158_cltghk3uo": {
    "callId": "call_1779383979158_cltghk3uo",
    "channel1Id": "1441553804364615760",
    "channel2Id": "1350789494940373137",
    "guild1Id": "1174254154361868298",
    "guild2Id": "1315672696226578502",
    "startTime": 1779383979158,
    "endTime": 1779384085452,
    "status": "ended",
    "messages": 0,
    "reconnectWindow": 1779384385452
  },
  "call_1779911598115_8jdepc9u1": {
    "callId": "call_1779911598115_8jdepc9u1",
    "channel1Id": "1373328677567201291",
    "channel2Id": "1362785399671619835",
    "guild1Id": "1276144243219365928",
    "guild2Id": "1315672696226578502",
    "startTime": 1779911598115,
    "endTime": null,
    "status": "active",
    "messages": 0,
    "reconnectWindow": null
  }
}
```

**Notes:**
- Key = `callId` (format: `call_<timestamp>_<random9char>`)
- `startTime` / `endTime` — Unix timestamps in milliseconds
- `reconnectWindow` — timestamp after which reconnect is no longer valid (endTime + 5 min); `null` if call is active
- `status` — `"active"` or `"ended"`
- `messages` — count of relayed messages during the call

---

## `data/users.json`

Record of all registered users.

```json
{
  "875703615099134013": {
    "userID": "875703615099134013",
    "username": "supernova0866",
    "tier": 3,
    "badges": ["owner"],
    "badgeVisibility": false,
    "accepted": true,
    "msgsent": 255,
    "heat": 0,
    "lastDecay": 1779911598114,
    "reputation": 0,
    "xp": 0,
    "level": 0
  },
  "1507038524535345323": {
    "userID": "1507038524535345323",
    "username": "sawnchielostway",
    "tier": 0,
    "badges": [],
    "badgeVisibility": true,
    "accepted": true,
    "msgsent": 20,
    "heat": 0,
    "lastDecay": 1779382440791
  },
  "1249350280395620477": {
    "userID": "1249350280395620477",
    "username": "ajax04805",
    "tier": 0,
    "badges": [],
    "badgeVisibility": true,
    "accepted": false,
    "msgsent": 5,
    "heat": 0,
    "lastDecay": 1779382639376
  }
}
```

**Notes:**
- Key = Discord user ID
- `tier` — `0` (text only) through `3` (all content); see tier table in project.md
- `badges` — array of badge IDs matching keys in `badges.json`
- `badgeVisibility` — whether badges show under relayed messages
- `accepted` — whether user has accepted terms; required before using commands
- `msgsent` — total messages relayed across all calls
- `heat` — current heat value; >100 blocks matching commands
- `lastDecay` — Unix timestamp (ms) of last heat decay calculation

---
