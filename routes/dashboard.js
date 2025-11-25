// routes/dashboard.js
import express from "express";
const router = express.Router();

// Middleware: Only logged-in users can access
function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect("/login");
  next();
}

// Dashboard home
router.get("/", requireLogin, (req, res) => {
  res.render("dashboard", { user: req.session.user });
});

export default router;
