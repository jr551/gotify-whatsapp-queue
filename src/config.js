import path from "node:path";

const parseInteger = (value, fallback, name) => {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`${name} must be an integer`);
  }

  return parsed;
};

const parseBoolean = (value, fallback = false) => {
  if (value == null || value === "") {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
};

const required = (value, name) => {
  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
};

const normalizeBaseUrl = (value) => value.replace(/\/+$/, "");

export const loadConfig = (env = process.env) => {
  const gotifyUrl = normalizeBaseUrl(required(env.GOTIFY_URL, "GOTIFY_URL"));
  const connectorName = env.CONNECTOR_NAME || "baileys-gotify-queue";
  const queueApplicationId = parseInteger(
    required(env.GOTIFY_QUEUE_APPLICATION_ID, "GOTIFY_QUEUE_APPLICATION_ID"),
    Number.NaN,
    "GOTIFY_QUEUE_APPLICATION_ID"
  );

  if (!Number.isFinite(queueApplicationId) || queueApplicationId <= 0) {
    throw new Error("GOTIFY_QUEUE_APPLICATION_ID must be a positive integer");
  }

  return {
    port: parseInteger(env.PORT, 3000, "PORT"),
    logLevel: env.LOG_LEVEL || "info",
    connectorName,
    wa: {
      authDir: path.resolve(env.WA_AUTH_DIR || ".data/baileys-auth"),
      pairingNumber: env.WA_PAIRING_NUMBER || "",
      syncFullHistory: parseBoolean(env.WA_SYNC_FULL_HISTORY, false)
    },
    gotify: {
      url: gotifyUrl,
      logAppToken: required(env.GOTIFY_LOG_APP_TOKEN, "GOTIFY_LOG_APP_TOKEN"),
      queueToken: required(env.GOTIFY_QUEUE_TOKEN, "GOTIFY_QUEUE_TOKEN"),
      queueApplicationId,
      pollIntervalMs: parseInteger(env.GOTIFY_POLL_INTERVAL_MS, 3000, "GOTIFY_POLL_INTERVAL_MS"),
      logPriority: parseInteger(env.GOTIFY_LOG_PRIORITY, 5, "GOTIFY_LOG_PRIORITY"),
      resultPriority: parseInteger(env.GOTIFY_RESULT_PRIORITY, 5, "GOTIFY_RESULT_PRIORITY")
    }
  };
};
