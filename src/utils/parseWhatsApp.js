function extractIncomingMessage(body) {
  try {
    const value = body?.entry?.[0]?.changes?.[0]?.value;

    // ✅ Ignore status updates
    if (value?.statuses?.length) return null;

    const msg = value?.messages?.[0];
    if (!msg) return null;

    return {
      from: msg.from,
      text: msg?.text?.body || "",
      messageId: msg.id,
      timestamp: msg.timestamp,
      raw: msg,
    };
  } catch (err) {
    return null;
  }
}

module.exports = { extractIncomingMessage };
