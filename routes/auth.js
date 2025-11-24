import express from "express";
const router = express.Router();

// Show login page
router.get("/login", (req, res) => {
  res.sendFile("login.html", { root: "./public" });
});

// Process login
router.post("/login", (req, res) => {
  const { username, password } = req.body;

  // Simple fixed login
  if (username === "admin" && password === "admin123") {
    return res.redirect("/admin");
  }

  return res.status(401).send("Invalid credentials");
});

export default router;
