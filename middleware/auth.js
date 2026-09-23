const jwt = require("jsonwebtoken");

/**
 * Admin authentication middleware — reads admin_token cookie.
 */
function adminAuth(req, res, next) {
  const token = req.cookies?.admin_token;
  if (!token) return res.status(401).json({ error: "غير مصرح" });
  try {
    req.admin = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "غير مصرح" });
  }
}

/**
 * Customer authentication middleware — reads customer_token cookie.
 */
function customerAuth(req, res, next) {
  const token = req.cookies?.customer_token;
  if (!token) return res.status(401).json({ error: "غير مصرح" });
  try {
    req.customer = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "انتهت الجلسة، يرجى تسجيل الدخول مجدداً" });
  }
}

module.exports = { adminAuth, customerAuth };
