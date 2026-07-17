interface RequestLike {
  readonly method?: string;
  readonly body?: unknown;
}

declare const process: { readonly env: Record<string, string | undefined> };

interface ResponseLike {
  status: (code: number) => ResponseLike;
  setHeader: (name: string, value: string) => ResponseLike;
  send: (body: string) => void;
  json: (body: unknown) => void;
}

export default async function handler(request: RequestLike, response: ResponseLike): Promise<void> {
  if (request.method !== "POST") {
    response.status(405).setHeader("Allow", "POST").json({ error: "Method not allowed." });
    return;
  }

  const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
  if (!apiKey) {
    response.status(503).json({ error: "DeepSeek is not configured on the server." });
    return;
  }

  const baseUrl = process.env.DEEPSEEK_BASE_URL?.trim() || "https://api.deepseek.com";
  const body = typeof request.body === "string" ? request.body : JSON.stringify(request.body ?? {});
  if (body.length > 128_000) {
    response.status(413).json({ error: "DeepSeek request is too large." });
    return;
  }

  try {
    const upstream = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body,
    });
    const payload = await upstream.text();
    response.status(upstream.status).setHeader("Content-Type", "application/json").send(payload);
  } catch {
    response.status(502).json({ error: "DeepSeek upstream request failed." });
  }
}
