const textFromMessage = (message = {}) =>
  message.conversation ||
  message.extendedTextMessage?.text ||
  message.imageMessage?.caption ||
  message.videoMessage?.caption ||
  message.documentMessage?.caption ||
  message.buttonsResponseMessage?.selectedDisplayText ||
  message.listResponseMessage?.title ||
  message.templateButtonReplyMessage?.selectedDisplayText ||
  null;

export const toConversationEvent = (message, context) => {
  const payload = {
    type: "conversation",
    source: "whatsapp",
    connector: context.connectorName,
    direction: message.key?.fromMe ? "outbound" : "inbound",
    chat: {
      jid: message.key?.remoteJid || null
    },
    sender: {
      jid: message.key?.participant || message.key?.remoteJid || null,
      pushName: message.pushName || null
    },
    timestamp: message.messageTimestamp ? Number(message.messageTimestamp) : null,
    messageId: message.key?.id || null,
    text: textFromMessage(message.message),
    raw: message
  };

  return payload;
};

const normalizeRecipient = (value) => {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error("send payload requires a non-empty 'to' value");
  }

  const trimmed = value.trim();
  if (trimmed.includes("@")) {
    return trimmed;
  }

  const digits = trimmed.replace(/\D/g, "");
  if (!digits) {
    throw new Error("send payload 'to' must be a jid or phone number");
  }

  return `${digits}@s.whatsapp.net`;
};

export const parseQueuePayload = (gotifyMessage) => {
  let payload;
  try {
    payload = JSON.parse(gotifyMessage.message);
  } catch {
    return null;
  }

  if (!payload || typeof payload !== "object") {
    return null;
  }

  if (payload.type !== "send") {
    return null;
  }

  if (typeof payload.text !== "string" || payload.text.trim() === "") {
    throw new Error("send payload requires a non-empty 'text' value");
  }

  return {
    requestId: gotifyMessage.id,
    to: normalizeRecipient(payload.to || payload.jid || payload.phone),
    text: payload.text,
    metadata: payload.metadata && typeof payload.metadata === "object" ? payload.metadata : {}
  };
};

export const toSendResultEvent = ({ connectorName, requestId, to, status, whatsappMessageId, error }) => ({
  type: "send_result",
  source: "gotify-queue",
  connector: connectorName,
  status,
  requestId,
  to,
  whatsappMessageId: whatsappMessageId || null,
  error: error || null,
  timestamp: new Date().toISOString()
});
