// routes/auth.js
import express from "express";
const router = express.Router();

// Temporary User Database
const USERS = {
  "hazwanihanafi@usm.my": "password123",
  "admin@usm.my": "admin123"
};

// Login Page
router.get("/login", (req, res) => {
  res.render("login");
});

// Login Process
router.post("/login", (req, res) => {
  const { email, password } = req.body;

  if (!USERS[email] || USERS[email] !== password) {
    return res.status(401).send("Invalid login");
  }

  req.session.user = email; // login success

  return res.redirect("/admin"); // GO TO DASHBOARD
});

// Logout
router.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/login");
  });
});

export default router;
