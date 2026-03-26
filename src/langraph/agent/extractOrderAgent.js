const { ChatOpenAI } = require("@langchain/openai");
const { z } = require("zod");

const llm = new ChatOpenAI({
  model: "gpt-4o-mini",
  temperature: 0.1,
});

const Schema = z.object({
  intent: z.enum(["order_add", "order_remove", "order_qty", "address", "confirm", "cancel", "menu", "track", "help", "unknown"]),
  items: z.array(
    z.object({
      name: z.string(),     // "pizza"
      qty: z.number().int().min(1).optional()
    })
  ).default([]),
  addressText: z.string().optional(),
});

async function extractFromText(userText, menuItems) {
  const menuStr = menuItems.map((m) => `${m.name} (keywords: ${(m.keywords||[]).join(",")})`).join(" | ");

  const prompt = `
You are a WhatsApp restaurant ordering bot.
Understand user message and return JSON.

Menu items: ${menuStr}

Intent rules:
- order_add: when user adds items (e.g. "2 pizza and 1 burger")
- order_remove: "remove burger" / "delete pizza"
- order_qty: "pizza qty 3" / "make burger 2"
- menu: show menu
- track: "track my order" / "order status"
- address: user provides address
- confirm/cancel/help/unknown accordingly

Output JSON:
{
  "intent": "...",
  "items": [{"name":"pizza","qty":2}],
  "addressText": "..."
}
`;

  const res = await llm.invoke([
    { role: "system", content: prompt.trim() },
    { role: "user", content: userText || "" },
  ]);

  try {
    const json = JSON.parse(res.content);
    const parsed = Schema.safeParse(json);
    if (!parsed.success) return { intent: "unknown", items: [] };
    return parsed.data;
  } catch {
    return { intent: "unknown", items: [] };
  }
}

module.exports = { extractFromText };
