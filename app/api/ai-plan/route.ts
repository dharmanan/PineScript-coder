import { NextResponse } from "next/server";
import { z } from "zod";

const bodySchema = z.object({
  prompt: z.string().min(10).max(4000),
  language: z.enum(["tr", "en"]).default("en")
});

const systemPrompt = (language: "tr" | "en") =>
  `You convert a trader's plain-language request into a conservative Kohen Pine Studio configuration plan. Do not promise profitability. Return JSON only with these keys: summary (string), suggestedPreset (string), choices (array of short strings), warnings (array of short strings). The deterministic builder remains the source of truth. Write all user-facing JSON values in ${language === "tr" ? "Turkish" : "English"}.`;

async function callOpenAI(prompt: string, language: "tr" | "en") {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not configured");
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      input: [
        { role: "system", content: [{ type: "input_text", text: systemPrompt(language) }] },
        { role: "user", content: [{ type: "input_text", text: prompt }] }
      ],
      text: { format: { type: "json_object" } }
    })
  });
  if (!response.ok) throw new Error(`OpenAI request failed: ${response.status}`);
  const data = await response.json();
  const text = data.output_text ?? data.output?.flatMap((o: any) => o.content ?? []).find((c: any) => c.type === "output_text")?.text;
  return JSON.parse(text);
}

async function callGemini(prompt: string, language: "tr" | "en") {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not configured");
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt(language) }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" }
    })
  });
  if (!response.ok) throw new Error(`Gemini request failed: ${response.status}`);
  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  return JSON.parse(text);
}

export async function POST(request: Request) {
  try {
    const { prompt, language } = bodySchema.parse(await request.json());
    const provider = (process.env.AI_PROVIDER || "gemini").toLowerCase();
    const result = provider === "openai"
      ? await callOpenAI(prompt, language)
      : await callGemini(prompt, language);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "AI planning failed" }, { status: 400 });
  }
}
