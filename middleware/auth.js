const crypto = require("crypto");

function verifyTelegramWebAppData(telegramInitData, botToken) {
  const initData = new URLSearchParams(telegramInitData);
  const hash = initData.get("hash");
  if (!hash) return false;

  initData.delete("hash");

  const paramsWithData = [];
  for (const [key, value] of initData.entries()) {
    paramsWithData.push(`${key}=${value}`);
  }

  paramsWithData.sort();
  const dataCheckString = paramsWithData.join("\n");

  const secretKey = crypto
    .createHmac("sha256", "WebAppData")
    .update(botToken)
    .digest();

  const calculatedHash = crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  if (calculatedHash === hash) {
    const userString = initData.get("user");
    return userString ? JSON.parse(userString) : null;
  }

  return false;
}

function authMiddleware(req, res, next) {
  const initData = req.headers["x-telegram-init-data"];
  const botToken = process.env.BOT_TOKEN;

  if (!initData || !botToken) {
    return res.status(401).json({ error: "Missing authentication parameters" });
  }

  const tgUser = verifyTelegramWebAppData(initData, botToken);
  if (!tgUser) {
    return res.status(403).json({ error: "Invalid Telegram signature" });
  }

  req.tgUser = tgUser;
  next();
}

module.exports = { authMiddleware };
