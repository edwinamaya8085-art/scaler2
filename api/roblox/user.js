// Serverless Roblox username lookup (Vercel Node function).
// POST { username } -> { user: { userId, username, displayName, avatarUrl, hasVerifiedBadge } }
// Proxies Roblox's public APIs server-side (the browser can't call them directly due to CORS).

async function readBody(req) {
  if (req.body !== undefined && req.body !== null) return req.body;
  return await new Promise(function (resolve) {
    var data = "";
    req.on("data", function (c) { data += c; });
    req.on("end", function () { resolve(data); });
    req.on("error", function () { resolve(""); });
  });
}

module.exports = async function (req, res) {
  // CORS (same-origin in practice, but permissive so it also works if hosted elsewhere)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed." }); return; }

  try {
    var body = await readBody(req);
    if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    if (!body || typeof body !== "object") body = {};

    var username = (body.username || "").toString().trim();
    if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) {
      res.status(400).json({ error: "Use 3-20 letters, numbers, or underscores." });
      return;
    }

    // 1) username -> Roblox user (this is what fails for non-existent usernames)
    var uResp = await fetch("https://users.roblox.com/v1/usernames/users", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ usernames: [username], excludeBannedUsers: false })
    });
    if (!uResp.ok) { res.status(502).json({ error: "The Roblox profile could not be loaded." }); return; }

    var uData = await uResp.json();
    var match = uData && uData.data && uData.data[0];
    if (!match || !match.id) {
      res.status(404).json({ error: "No Roblox account was found with that username." });
      return;
    }

    var userId = match.id;
    var name = match.name || username;
    var displayName = match.displayName || name;
    var hasVerifiedBadge = !!match.hasVerifiedBadge;

    // 2) userId -> avatar headshot image url
    var avatarUrl = "";
    try {
      var tResp = await fetch(
        "https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=" +
        encodeURIComponent(userId) + "&size=420x420&format=Png&isCircular=false"
      );
      if (tResp.ok) {
        var tData = await tResp.json();
        var t = tData && tData.data && tData.data[0];
        if (t && t.imageUrl) avatarUrl = t.imageUrl;
      }
    } catch (e) { /* fall back to initials avatar on the client */ }

    res.status(200).json({
      user: {
        userId: userId,
        username: name,
        displayName: displayName,
        avatarUrl: avatarUrl,
        hasVerifiedBadge: hasVerifiedBadge
      }
    });
  } catch (e) {
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
};
