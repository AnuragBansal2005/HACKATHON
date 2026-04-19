import axios from "axios";

const GROQ_API = "https://api.groq.com/openai/v1/chat/completions";

export interface ChatMessageInput {
  role: "user" | "assistant";
  content: string;
}

export async function callGroq(messages: ChatMessageInput[], maxTokens = 1000, system?: string): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not configured");
  }

  const { data } = await axios.post(
    GROQ_API,
    {
      model: "llama-3.3-70b-versatile",
      max_tokens: maxTokens,
      messages: system ? [{ role: "system", content: system }, ...messages] : messages,
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      timeout: 20_000,
    },
  );

  const text = (data?.choices?.[0]?.message?.content as string | undefined)?.trim();
  if (!text) {
    throw new Error("Groq returned an empty response");
  }

  return text;
}
