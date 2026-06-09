export default async function handler(req, res) {
  const key = process.env.TRELLO_API_KEY;
  const token = process.env.TRELLO_API_TOKEN;

  if (!key || !token) {
    res.status(500).json({
      error: "Missing Trello credentials. Set TRELLO_API_KEY and TRELLO_API_TOKEN in Vercel env vars."
    });
    return;
  }

  const base = "https://api.trello.com/1";
  const qs = `key=${encodeURIComponent(key)}&token=${encodeURIComponent(token)}`;

  if (req.method === "GET") {
    const { boardId, listId, action } = req.query;

    try {
      // GET /api/trello?boardId=... => board info + lists
      // GET /api/trello?action=cards&listId=... => cards in a list
      if (action === "cards") {
        if (!listId) return res.status(400).json({ error: "listId required" });

        const r = await fetch(
          `${base}/lists/${listId}/cards?${qs}&fields=name,url,desc,idList`
        );
        const json = await r.json();
        return res.status(r.ok ? 200 : r.status).json(json);
      }

      if (!boardId) return res.status(400).json({ error: "boardId required" });

      const r = await fetch(
        `${base}/boards/${boardId}?${qs}&fields=name,url&lists=open&list_fields=name,id`
      );
      const json = await r.json();
      return res.status(r.ok ? 200 : r.status).json(json);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: "Trello request failed" });
    }
  }

  if (req.method === "POST") {
    // POST /api/trello => create card
    // body: { listId, name, desc }
    const { listId, name, desc } = req.body || {};
    if (!listId || !name) {
      return res.status(400).json({ error: "listId and name required" });
    }

    try {
      const body = new URLSearchParams({
        idList: listId,
        name,
        desc: desc || ""
      }).toString();

      const r = await fetch(`${base}/cards?${qs}`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body
      });

      const json = await r.json();
      return res.status(r.ok ? 200 : r.status).json(json);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: "Failed to create Trello card" });
    }
  }

  res.setHeader("Allow", ["GET", "POST"]);
  res.status(405).end("Method Not Allowed");
}
