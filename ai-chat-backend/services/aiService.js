async function getAIReply(message, contextMessages = []) {
  const apiKey = process.env.GROQ_API_KEY;
  const model = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

  if (!apiKey) {
    throw { message: "GROQ_API_KEY is not set" };
  }

  const normalizedContext = Array.isArray(contextMessages)
    ? contextMessages
      .filter((item) => item && (item.role === "user" || item.role === "assistant"))
      .map((item) => ({
        role: item.role,
        content: String(item.content || "")
      }))
      .filter((item) => item.content.trim().length > 0)
    : [];

  const promptMessages =
    normalizedContext.length > 0
      ? normalizedContext
      : [
        {
          role: "user",
          content: String(message || "")
        }
      ];

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content: `
              You are Chattr AI, a smart, friendly, and slightly witty assistant inside a modern chat app.

                Your personality:
                - Talk like a real human, not like a robot
                - Keep replies short and conversational (1–3 lines max)
                - Be helpful but casual
                - Add light humor when appropriate
                - Never sound too formal or robotic

                Chat style:
                - Use natural texting tone (like WhatsApp)
                - Avoid long paragraphs
                - Sometimes use emojis (but not too many)
                - If user is casual, match their tone
                - If user is serious, respond appropriately

                Rules:
                - Do NOT say "As an AI..."
                - Do NOT give long essays unless asked
                - Keep it engaging and human-like

                You are chatting inside a mobile app, not writing an article.
`
        },
        ...promptMessages
      ]
    })
  });

  const data = await response.json();

  if (!response.ok) {
    const errorMessage =
      data && data.error && data.error.message
        ? data.error.message
        : "Groq API request failed";
    throw { message: errorMessage };
  }

  const text = data?.choices?.[0]?.message?.content;

  return text || "Sorry, I could not generate a response right now.";
}

async function rewriteWithAI(message) {
  const apiKey = process.env.GROQ_API_KEY;
  const model = process.env.GROQ_REWRITE_MODEL || "llama-3.3-70b-versatile";

  if (!apiKey) {
    throw { message: "GROQ_API_KEY is not set" };
  }

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content: `
Rewrite the user's message in a more clear, polite, and natural way.

Rules:
- Keep it short
- Keep original meaning
- Make it sound better
- Do not add extra explanation
          `
        },
        {
          role: "user",
          content: String(message || "")
        }
      ]
    })
  });

  const data = await response.json();

  if (!response.ok) {
    const errorMessage =
      data && data.error && data.error.message
        ? data.error.message
        : "Groq API request failed";
    throw { message: errorMessage };
  }

  const rewrittenText = data?.choices?.[0]?.message?.content;
  return rewrittenText || String(message || "");
}

async function generateSuggestions(message) {
  const apiKey = process.env.GROQ_API_KEY;
  const model = process.env.GROQ_SUGGEST_MODEL || "llama-3.3-70b-versatile";

  if (!apiKey) {
    throw { message: "GROQ_API_KEY is not set" };
  }

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content: `
Generate 3 short reply suggestions for a chat message.

Rules:
- Very short (1 line each)
- Natural texting style
- Different tones
- Return ONLY JSON array

Example:
["Yes 👍", "On my way", "Can’t make it"]
          `
        },
        {
          role: "user",
          content: String(message || "")
        }
      ]
    })
  });

  const data = await response.json();

  if (!response.ok) {
    const errorMessage =
      data && data.error && data.error.message
        ? data.error.message
        : "Groq API request failed";
    throw { message: errorMessage };
  }

  const text = data?.choices?.[0]?.message?.content || "[]";

  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed.slice(0, 3) : [];
  } catch (error) {
    const match = text.match(/\[.*\]/s);
    if (!match) {
      return [];
    }

    const parsed = JSON.parse(match[0]);
    return Array.isArray(parsed) ? parsed.slice(0, 3) : [];
  }
}

async function generateAutoReply(message) {
  const apiKey = process.env.GROQ_API_KEY;
  const model = process.env.GROQ_AUTOREPLY_MODEL || "llama-3.3-70b-versatile";

  if (!apiKey) {
    throw { message: "GROQ_API_KEY is not set" };
  }

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content: `
Generate a short auto-reply for a chat message.

Rules:
- Keep it very short
- Sound natural
- Casual tone
- No explanation
          `
        },
        {
          role: "user",
          content: String(message || "")
        }
      ]
    })
  });

  const data = await response.json();

  if (!response.ok) {
    const errorMessage =
      data && data.error && data.error.message
        ? data.error.message
        : "Groq API request failed";
    throw { message: errorMessage };
  }

  const text = data?.choices?.[0]?.message?.content;
  return text || "Got it.";
}

module.exports = { getAIReply, rewriteWithAI, generateSuggestions, generateAutoReply };
