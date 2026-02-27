export class GlobalQuota {
  constructor(state) {
    this.state = state;
  }

  _monthKeyUTC() {
    const d = new Date();
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    return `${yyyy}-${mm}`;
  }

  async fetch(req) {
    const url = new URL(req.url);

    // 月次使用量取得
    if (url.pathname === "/get" && req.method === "GET") {
      const key = `bytes:${this._monthKeyUTC()}`;
      const usedBytes = Number((await this.state.storage.get(key)) || 0);
      return Response.json({ monthUTC: this._monthKeyUTC(), usedBytes });
    }

    // 月次加算（上限チェック）
    if (url.pathname === "/add" && req.method === "POST") {
      const { addBytes, limitBytes } = await req.json();
      const add = Number(addBytes || 0);
      const limit = Number(limitBytes || 0);

      if (add <= 0 || limit <= 0) {
        return new Response("Bad Request", { status: 400 });
      }

      const key = `bytes:${this._monthKeyUTC()}`;
      const cur = Number((await this.state.storage.get(key)) || 0);
      const next = cur + add;

      if (next > limit) {
        return new Response("Monthly quota exceeded", { status: 429 });
      }

      await this.state.storage.put(key, next);
      return new Response("OK");
    }

    return new Response("Not Found", { status: 404 });
  }
}
