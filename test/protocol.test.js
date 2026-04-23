import test from "node:test";
import assert from "node:assert/strict";

import { parseQueuePayload, toConversationEvent } from "../src/protocol.js";

test("parseQueuePayload accepts send requests with phone numbers", () => {
  const payload = parseQueuePayload({
    id: 42,
    message: JSON.stringify({
      type: "send",
      to: "+1 (202) 555-0101",
      text: "hello"
    })
  });

  assert.deepEqual(payload, {
    requestId: 42,
    to: "12025550101@s.whatsapp.net",
    text: "hello",
    metadata: {}
  });
});

test("parseQueuePayload ignores non-json and non-send messages", () => {
  assert.equal(parseQueuePayload({ id: 1, message: "not json" }), null);
  assert.equal(parseQueuePayload({ id: 2, message: JSON.stringify({ type: "conversation" }) }), null);
});

test("toConversationEvent marks outbound direction", () => {
  const event = toConversationEvent(
    {
      key: {
        fromMe: true,
        remoteJid: "123@s.whatsapp.net",
        id: "abc"
      },
      pushName: "John",
      messageTimestamp: 123,
      message: {
        conversation: "hi"
      }
    },
    { connectorName: "connector" }
  );

  assert.equal(event.direction, "outbound");
  assert.equal(event.text, "hi");
  assert.equal(event.chat.jid, "123@s.whatsapp.net");
});
