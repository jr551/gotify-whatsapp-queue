import "dotenv/config";
import http from "node:http";
import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import pino from "pino";
import qrcode from "qrcode-terminal";

import { loadConfig } from "./config.js";
import { GotifyClient } from "./gotify-client.js";
import { parseQueuePayload, toConversationEvent, toSendResultEvent } from "./protocol.js";

const config = loadConfig();
const logger = pino({ level: config.logLevel });
const gotify = new GotifyClient(config.gotify);

let sock;
let currentQr;
let pollTimer;
let isPolling = false;

const ensureHttpProbe = () => {
  const server = http.createServer((_, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  });

  server.listen(config.port, () => {
    logger.info({ port: config.port }, "health probe listening");
  });
};

const maybeRequestPairingCode = async (socket) => {
  if (config.wa.pairingNumber && !socket.authState.creds.registered) {
    const code = await socket.requestPairingCode(config.wa.pairingNumber);
    logger.info({ pairingCode: code }, "pairing code generated");
  }
};

const connectWhatsApp = async () => {
  const { state, saveCreds } = await useMultiFileAuthState(config.wa.authDir);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    auth: state,
    browser: Browsers.macOS(config.connectorName),
    version,
    syncFullHistory: config.wa.syncFullHistory,
    markOnlineOnConnect: false,
    printQRInTerminal: false,
    logger
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr && qr !== currentQr) {
      currentQr = qr;
      qrcode.generate(qr, { small: true });
      logger.info("scan the QR code above to authenticate");
    }

    if (connection === "open") {
      currentQr = null;
      logger.info("whatsapp connected");
      return;
    }

    if (connection !== "close") {
      return;
    }

    const boom = lastDisconnect?.error instanceof Boom ? lastDisconnect.error : null;
    const statusCode = boom?.output?.statusCode;
    const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

    logger.warn({ statusCode }, "whatsapp disconnected");
    if (shouldReconnect) {
      setTimeout(() => {
        connectWhatsApp().catch((error) => logger.error({ err: error }, "reconnect failed"));
      }, 2_000);
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") {
      return;
    }

    for (const message of messages) {
      const jid = message.key?.remoteJid;
      if (!jid || jid === "status@broadcast") {
        continue;
      }

      try {
        await gotify.pushConversation(
          toConversationEvent(message, { connectorName: config.connectorName })
        );
      } catch (error) {
        logger.error({ err: error, messageId: message.key?.id }, "failed to log conversation");
      }
    }
  });

  await maybeRequestPairingCode(sock);
};

const processQueueMessage = async (queueMessage) => {
  let parsed;

  try {
    parsed = parseQueuePayload(queueMessage);
  } catch (error) {
    logger.warn({ err: error, queueMessageId: queueMessage.id }, "invalid send payload");
    return;
  }

  if (!parsed) {
    return;
  }

  if (!sock) {
    logger.warn({ queueMessageId: queueMessage.id }, "queue message skipped because whatsapp is not ready");
    return;
  }

  try {
    const response = await sock.sendMessage(parsed.to, { text: parsed.text });
    await gotify.deleteMessage(queueMessage.id);
    await gotify.pushSendResult(
      toSendResultEvent({
        connectorName: config.connectorName,
        requestId: parsed.requestId,
        to: parsed.to,
        status: "sent",
        whatsappMessageId: response?.key?.id
      })
    );
    logger.info({ queueMessageId: queueMessage.id, to: parsed.to }, "queue message sent");
  } catch (error) {
    await gotify.pushSendResult(
      toSendResultEvent({
        connectorName: config.connectorName,
        requestId: parsed.requestId,
        to: parsed.to,
        status: "error",
        error: error instanceof Error ? error.message : String(error)
      })
    );
    logger.error({ err: error, queueMessageId: queueMessage.id }, "failed to send queue message");
  }
};

const pollQueue = async () => {
  if (isPolling) {
    return;
  }

  isPolling = true;

  try {
    const messages = await gotify.listQueueMessages();
    messages.sort((a, b) => a.id - b.id);

    for (const message of messages) {
      await processQueueMessage(message);
    }
  } catch (error) {
    logger.error({ err: error }, "queue polling failed");
  } finally {
    isPolling = false;
  }
};

const startQueuePolling = () => {
  pollTimer = setInterval(() => {
    pollQueue().catch((error) => logger.error({ err: error }, "queue polling crashed"));
  }, config.gotify.pollIntervalMs);

  pollQueue().catch((error) => logger.error({ err: error }, "initial queue polling failed"));
};

const start = async () => {
  ensureHttpProbe();
  await connectWhatsApp();
  startQueuePolling();
};

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, async () => {
    if (pollTimer) {
      clearInterval(pollTimer);
    }

    try {
      sock?.ws?.close();
    } catch (error) {
      logger.warn({ err: error }, "socket shutdown failed");
    }

    process.exit(0);
  });
}

start().catch((error) => {
  logger.error({ err: error }, "startup failed");
  process.exit(1);
});
