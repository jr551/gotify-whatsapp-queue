const jsonHeaders = {
  "Content-Type": "application/json"
};

const ensureOk = async (response, action) => {
  if (response.ok) {
    return response;
  }

  const body = await response.text();
  throw new Error(`${action} failed with ${response.status}: ${body}`);
};

export class GotifyClient {
  constructor(config) {
    this.url = config.url;
    this.logAppToken = config.logAppToken;
    this.queueToken = config.queueToken;
    this.queueApplicationId = config.queueApplicationId;
    this.logPriority = config.logPriority;
    this.resultPriority = config.resultPriority;
  }

  async pushJson(payload, { title, priority } = {}) {
    const response = await fetch(`${this.url}/message?token=${encodeURIComponent(this.logAppToken)}`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({
        title,
        priority: priority ?? this.logPriority,
        message: JSON.stringify(payload),
        extras: {
          "client::display": {
            contentType: "text/plain"
          }
        }
      })
    });

    await ensureOk(response, "push message");
    return response.json();
  }

  async pushConversation(payload) {
    return this.pushJson(payload, {
      title: `whatsapp:${payload.direction}`,
      priority: this.logPriority
    });
  }

  async pushSendResult(payload) {
    return this.pushJson(payload, {
      title: `whatsapp-send:${payload.status}`,
      priority: this.resultPriority
    });
  }

  async listQueueMessages(limit = 50) {
    const params = new URLSearchParams({
      token: this.queueToken,
      limit: String(limit)
    });

    const response = await fetch(
      `${this.url}/application/${this.queueApplicationId}/message?${params.toString()}`,
      { headers: { Accept: "application/json" } }
    );

    await ensureOk(response, "list queue messages");
    const body = await response.json();
    return Array.isArray(body.messages) ? body.messages : [];
  }

  async deleteMessage(messageId) {
    const response = await fetch(
      `${this.url}/message/${messageId}?token=${encodeURIComponent(this.queueToken)}`,
      { method: "DELETE" }
    );

    await ensureOk(response, "delete queue message");
  }
}
