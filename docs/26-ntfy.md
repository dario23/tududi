# ntfy Notifications

Tududi can send notifications to an [ntfy](https://ntfy.sh) topic, so they arrive in the ntfy app on a phone or desktop. It works with the public ntfy.sh server and with a self-hosted ntfy server, and needs no bot and no tududi install on the phone.

## Setting it up

1. In the ntfy app, subscribe to a topic (for example `https://ntfy.sh/a-hard-to-guess-name`, or a topic on your own server).
2. In tududi, open **Profile → Notifications**. In the **ntfy** card, enter the full topic address and, for a protected topic, an access token (`tk_...`), then **Save**.
3. Turn on the **ntfy** column for the notification types you want, and use **Test** at the bottom of that column to check it.

Anyone who knows a topic name on ntfy.sh can read the topic, so use a long random name there or a protected topic with an access token.

## What gets sent

Every type in the Notifications table can go to ntfy: due and overdue tasks and projects, defer until, task assigned, comments and mentions, and habit reminders. Each notification is one ntfy message:

| ntfy field | Value |
|------------|-------|
| `title` | The notification title |
| `message` | The notification text |
| `priority` | 4 (high) for overdue items (`level: error`), otherwise 3 (default) |
| `tags` | `rotating_light` for overdue, `warning` for due soon |
| `click` | The task, project or habit in tududi (`FRONTEND_URL` + path) |

A reminder that the scheduler recreates is sent at most once per 24 hours (`channel_sent_at.ntfy`), the same rule as Push and Telegram. When the ntfy server cannot be reached or refuses the message, the in-app notification is still created and the error is logged.

The scheduled Telegram task summary is not sent to ntfy.

## How it works

- Settings live on the user: `users.ntfy_topic_url` and `users.ntfy_token_encrypted`. The token is encrypted with `backend/shared/crypto/secretCipher.js`, like calendar feed addresses, so saving one needs `TUDUDI_SESSION_SECRET` (or `TUDUDI_OIDC_SECRET_ENCRYPTION_KEY`). The API never returns it, only `has_token`.
- Producers add `'ntfy'` to `sources` when the type's `ntfy` preference is on (`appDeliverySources()` / `deliverySources()` in `backend/utils/notificationPreferences.js`). `Notification.createNotification` hands the row to `backend/modules/ntfy/service.js`.
- `backend/modules/ntfy/sender.js` splits the topic address into server and topic and publishes JSON to the server root (`POST https://ntfy.sh/` with `{ topic, title, message, ... }`), which keeps non-ASCII titles intact.

## Network safety

The topic address is user input that makes the server send requests, so it goes through the same SSRF guard as link previews and AI base URLs: only public addresses on ports 80 and 443, checked before the request and again when the socket connects (no DNS rebinding), and no redirects.

A self-hosted ntfy server on the same network as tududi is refused unless the operator sets:

| Variable | Effect |
|----------|--------|
| `NTFY_ALLOW_PRIVATE_HOSTS=true` | Allows loopback, LAN and other private addresses, any port, and plain http. Link-local addresses (cloud metadata) stay blocked |

In hosted mode, ntfy is a plan feature (`ntfy`), like Telegram.

## API

| Endpoint | Purpose |
|----------|---------|
| `GET /api/ntfy` | `{ topic_url, has_token }` |
| `PUT /api/ntfy` | Save `{ topic_url, token? }`. Leave `token` out to keep the saved one, send `""` to remove it. An empty `topic_url` turns ntfy off |
| `DELETE /api/ntfy` | Turn ntfy off and forget the token |
| `POST /api/test-notifications/trigger` | `{ channel: "ntfy" }` sends a test message |
