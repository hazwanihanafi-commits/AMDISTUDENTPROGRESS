import express from "express";
import dotenv from "dotenv";
dotenv.config();

const router = express.Router();

router.get("/login", (req, res) => {
  res.render("login");
});

router.post("/login", (req, res) => {
  const { email, password } = req.body;

  if (
    email === process.env.ADMIN_EMAIL &&
    password === process.env.ADMIN_PASSWORD
  ) {
    return res.redirect("/admin");
  }

  res.status(401).send("Invalid login");
});

export default router;
