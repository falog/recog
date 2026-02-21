export default {
  async fetch(request, env) {
    if (request.method === "GET") {
      return new Response(
        "It Works.\n",
        { headers: { "content-type": "text/plain; charset=utf-8" } }
      );
    }

    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    // 受け取ったWAVをそのままWorkers AI Whisperへ
    const buf = await request.arrayBuffer();
    const inputs = { audio: [...new Uint8Array(buf)] };

    const r = await env.AI.run("@cf/openai/whisper", inputs);

    // 返すのは結果だけ（音声バイトは返さない）
    return Response.json({ text: r?.text ?? "", raw: r });
  },
};
