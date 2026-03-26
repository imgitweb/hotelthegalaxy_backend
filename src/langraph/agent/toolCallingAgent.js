const { ChatOpenAI } = require("@langchain/openai");
const { z } = require("zod");

const llm = new ChatOpenAI({
  model: "gpt-4o-mini",
  temperature: 0.1,
  // 🔥 Ensures LLM always returns valid JSON
  modelKwargs: { response_format: { type: "json_object" } }, 
});

const AgentSchema = z.object({
  intent: z.enum([
    "menu", "order_add", "order_remove", "order_qty", 
    "address", "confirm", "cancel", "track", "help", "unknown"
  ]),
  items: z.array(
    z.object({
      name: z.string(),
      qty: z.number().int().min(1).optional()
    })
  ).default([]),
  addressText: z.string().optional(),
});

// 🔥 FIX: Default 'menu' to an empty array so it NEVER crashes if omitted
async function agentDecide(userText, menu = []) {
  // 🔥 FIX: Check if menu is actually an array before mapping
  const safeMenu = Array.isArray(menu) ? menu : [];
  
  const menuStr = safeMenu.length > 0 
    ? safeMenu.map((m) => `${m.name} (keywords: ${(m.keywords || []).join(", ")})`).join(" | ")
    : "General Restaurant Menu";

  const prompt = `
You are a WhatsApp restaurant ordering bot. Your job is ONLY to extract structured info.
Menu: ${menuStr}

Return ONLY a JSON object matching this structure:
{
  "intent": "...",
  "items": [{"name":"pizza", "qty":2}],
  "addressText": "..."
}

Intent Rules:
- order_add: User adds items (e.g., "2 pizza and 1 burger").
- order_remove: User removes items (e.g., "remove burger").
- order_qty: User changes quantity (e.g., "make pizza qty 3").
- address: User provides delivery address.
- menu/confirm/cancel/track/help/unknown: Classify accordingly.
`;

  try {
    const res = await llm.invoke([
      { role: "system", content: prompt.trim() },
      { role: "user", content: userText || "" },
    ]);

    const json = JSON.parse(res.content);
    const parsed = AgentSchema.safeParse(json);
    
    if (!parsed.success) {
      console.error("❌ Zod Parsing Error:", parsed.error);
      return { intent: "unknown", items: [] };
    }
    
    // 🔥 FIX: Ensure items is always an array, even if AI acts weird
    return {
      ...parsed.data,
      items: parsed.data.items || []
    };

  } catch (err) {
    console.error("❌ Agent Error:", err.message);
    return { intent: "unknown", items: [] };
  }
}

module.exports = { agentDecide };