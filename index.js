export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const lang = url.searchParams.get("lang"); // 例: ja, en, auto

    if (request.method === "GET") {
      return new Response("It Works.\n", {
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }

    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const buf = await request.arrayBuffer();

    const inputs = {
      audio: [...new Uint8Array(buf)],
      ...(lang && lang !== "auto" ? { language: lang } : {}),
    };

    const r = await env.AI.run("@cf/openai/whisper", inputs);

    return Response.json({
      text: r?.text ?? "",
      detected_language: r?.language ?? null,
    });
  },
};
