// routes/api.js
import express from "express";

const router = express.Router();

router.get("/", (req, res) => {
  res.json({ ok: true, message: "API is working" });
});

export default router;
