// routes/index.js
import express from "express";
const router = express.Router();

router.get("/", (req, res) => {
  res.redirect("/login");
});

export default router;
