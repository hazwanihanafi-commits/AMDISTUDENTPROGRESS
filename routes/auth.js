// routes/auth.js
import express from "express";
const router = express.Router();

// Hard-coded temporary users
const USERS = {
  "hazwanihanafi@usm.my": "password123",
  "admin@usm.my": "admin123"
};

router.get("/login", (req, res) => {
  res.render("login");
});

router.post("/login", (req, res) => {
  const { email, password } = req.body;

  console.log("Login attempt:", email);

  if (!USERS[email] || USERS[email] !== password) {
    return res.status(401).send("Invalid login");
  }

  // Save session
  req.session.user = email;

  res.redirect("/admin");
});

router.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/login");
  });
});

export default router;
