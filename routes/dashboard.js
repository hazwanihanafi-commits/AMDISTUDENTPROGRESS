// routes/dashboard.js
import express from "express";
const router = express.Router();

router.get("/admin", (req, res) => {
  if (!req.session.user) {
    return res.redirect("/login");
  }
  res.render("admin", { email: req.session.user });
});

export default router;
