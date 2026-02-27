// src/index.js
export { GlobalQuota } from "./global_quota.js";

// "RIFF"...."WAVE" の最小チェック（WAV以外(mp3/aac等)の抜け道を塞ぐ）
function isWav(u8) {
  return (
    u8.length >= 12 &&
    u8[0] === 0x52 && u8[1] === 0x49 && u8[2] === 0x46 && u8[3] === 0x46 && // RIFF
    u8[8] === 0x57 && u8[9] === 0x41 && u8[10] === 0x56 && u8[11] === 0x45   // WAVE
  );
}

// /quota 用（人間が見やすい表示）
function formatBytes(n) {
  const units = ["B", "KiB", "MiB", "GiB"];
  let v = Number(n);
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const lang = url.searchParams.get("lang"); // 例: ja, en, auto

    // 月次使用量の確認（IPごとではなく全体合算）
    if (request.method === "GET" && url.pathname === "/quota") {
      const limit = Number(env.MONTHLY_TOTAL_BYTES_LIMIT || 0);
      const stub = env.GLOBAL_QUOTA.get(env.GLOBAL_QUOTA.idFromName("global"));

      const r = await stub.fetch("https://quota/get", { method: "GET" });
      if (!r.ok) return new Response("Quota read failed", { status: 500 });

      const { monthUTC, usedBytes } = await r.json();
      const remainingBytes = limit > 0 ? Math.max(0, limit - usedBytes) : null;

      return Response.json({
        monthUTC,
        limitBytes: limit,
        usedBytes,
        remainingBytes,
        limitHuman: limit > 0 ? formatBytes(limit) : null,
        usedHuman: formatBytes(usedBytes),
        remainingHuman: remainingBytes !== null ? formatBytes(remainingBytes) : null,
      });
    }

    // Healthcheck
    if (request.method === "GET") {
      return new Response("It Works.\n", {
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }

    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    // 1) Content-Lengthで早期拒否（読む前に弾く）
    const len = Number(request.headers.get("content-length") || "0");
    if (!len) return new Response("Length required", { status: 411 });

    const perReqMax = Number(env.MAX_PER_REQUEST_BYTES || 0);
    if (perReqMax > 0 && len > perReqMax) {
      return new Response("Payload too large", { status: 413 });
    }

    // 2) 月次合算（全体合算）
    const limit = Number(env.MONTHLY_TOTAL_BYTES_LIMIT || 0);
    if (limit > 0) {
      const stub = env.GLOBAL_QUOTA.get(env.GLOBAL_QUOTA.idFromName("global"));
      const gate = await stub.fetch("https://quota/add", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ addBytes: len, limitBytes: limit }),
      });
      if (!gate.ok) return gate;
    }

    // 3) ボディを読む（現行と同じ）
    const buf = await request.arrayBuffer();
    const u8 = new Uint8Array(buf);

    // 4) WAV以外は拒否（mp3/aacの抜け道を塞ぐ）
    if (!isWav(u8)) {
      return new Response("Only WAV (RIFF/WAVE) is allowed", { status: 415 });
    }

    const inputs = {
      audio: [...u8], // 現行互換（※重い。上限で抑える前提）
      task: "transcribe",
      language: lang ?? undefined,
      word_timestamps: true,
    };

    const r = await env.AI.run("@cf/openai/whisper", inputs);

    return Response.json({
      raw: r,
    });
  },
};
