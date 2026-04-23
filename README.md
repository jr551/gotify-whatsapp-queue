# Gotify WhatsApp Queue

This service connects to WhatsApp through Baileys, writes conversation events to Gotify as JSON strings, and watches a Gotify application as an outbound queue.

The deployment target is a lightweight Docker Compose stack. The connector itself stays on Node because Baileys is a Node library; switching to Rust would require replacing Baileys entirely.

## Queue model

Use two Gotify application contexts:

1. `GOTIFY_LOG_APP_TOKEN`: this connector writes conversation and send-result events here.
2. `GOTIFY_QUEUE_APPLICATION_ID` + `GOTIFY_QUEUE_TOKEN`: this connector reads queued send requests here and deletes them after a successful send.

That split avoids consuming the connector's own conversation logs as outbound work.

## Outbound payload

Another producer can ask the connector to send a message by posting JSON text into the queue application:

```json
{
  "type": "send",
  "to": "+12025550101",
  "text": "hello from gotify"
}
```

`to` may also be a full WhatsApp JID like `12025550101@s.whatsapp.net`.

When the send succeeds, the original queue message is deleted and the connector writes a result event like:

```json
{
  "type": "send_result",
  "source": "gotify-queue",
  "connector": "baileys-gotify-queue",
  "status": "sent",
  "requestId": 123,
  "to": "12025550101@s.whatsapp.net",
  "whatsappMessageId": "ABCDEF...",
  "error": null,
  "timestamp": "2026-04-23T12:34:56.000Z"
}
```

## Inbound conversation event

Incoming and outgoing WhatsApp messages are written to Gotify as JSON text with a `type` of `conversation`, direction metadata, extracted text when available, and the raw Baileys message object.

## Docker Compose

1. Copy `.env.example` to `.env`.
2. Start the stack with `docker compose up -d --build`.
3. Open Gotify at `http://localhost:8008` and log in with the default admin credentials from compose.
4. Create:
   - one application for connector logs and copy its token into `GOTIFY_LOG_APP_TOKEN`
   - one application to act as the outbound queue
   - one client or user token with permission to read and delete messages
5. Put the queue application id into `GOTIFY_QUEUE_APPLICATION_ID` and the readable token into `GOTIFY_QUEUE_TOKEN`.
6. Restart the connector with `docker compose up -d connector`.

Baileys auth files are stored in the `wa_auth` Docker volume.

## Local Run

If you want to run it outside Docker:

1. `npm install`
2. `npm start`

## Notes

- Gotify application tokens can send messages, but reading and deleting queue items requires a token with message management access.
- The consumer currently sends text messages only.
- Failed sends are not deleted from the queue; a `send_result` event with `status: "error"` is logged instead.
- `docker-compose.yml` includes a Gotify server so the stack is self-contained.
