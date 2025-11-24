import express from "express";
import { getAuthClient } from "../services/googleAuth.js";
import { readMasterTracking } from "../services/googleSheets.js";

const router = express.Router();

// Landing page → Login
router.get("/", (req, res) => {
  res.redirect("/login");
});

// Login page (GET)
router.get("/login", (req, res) => {
  res.render("login");
});

// Login action (POST)
router.post("/login", (req, res) => {
  // Temporary: no password check
  res.redirect("/dashboard");
});

// Dashboard page
router.get("/dashboard", async (req, res, next) => {
  try {
    const auth = await getAuthClient();
    const students = await readMasterTracking(auth, process.env.SHEET_ID);

    const totalPct = students.length
      ? Math.round(students.reduce((s, st) => s + st.progress.percentage, 0) / students.length)
      : 0;

    res.render("index", { students, totalPct });
  } catch (err) {
    next(err);
  }
});

export default router;
