const db = require("../db");

const logEvent = async (userId, eventType, metadata = {}) => {
  try {
    await db.query(
      "INSERT INTO events (user_id, event_type, metadata) VALUES (?, ?, ?)",
      [userId, eventType, JSON.stringify(metadata || {})]
    );
  } catch (err) {
    console.error("Event log error:", err);
  }
};

module.exports = { logEvent };
