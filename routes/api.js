// routes/api.js
import express from "express";
import { readMasterTracking } from "../services/googleSheets.js";

const router = express.Router();

// ---------- /api/all ----------
router.get("/all", async (req, res) => {
  try {
    const students = await readMasterTracking(process.env.SHEET_ID);

    const total = students.length;
    const completed = students.filter(
      s => s.progress.level === "P5" && s.p5Approved
    ).length;

    const stages = {
      P1: students.filter(s => s.p1Submitted || s.p1Approved).length,
      P3: students.filter(s => s.p3Submitted || s.p3Approved).length,
      P4: students.filter(s => s.p4Submitted || s.p4Approved).length,
      P5: students.filter(s => s.p5Submitted || s.p5Approved).length,
    };

    res.json({
      total,
      completed,
      stages,
      students,
    });

  } catch (err) {
    console.error("API /all error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ---------- /api/status ----------
router.get("/status", async (req, res) => {
  try {
    const matric = (req.query.matric || "").trim();
    if (!matric) return res.json({ error: "Matric missing" });

    const students = await readMasterTracking(process.env.SHEET_ID);
    const s = students.find(st => String(st.matric).trim() === matric);

    if (!s) return res.json({ error: "Student not found" });

    res.json({
      matric: s.matric,
      studentName: s.name,
      P1: s.p1Submitted ? "Submitted" : "",
      P3: s.p3Submitted ? "Submitted" : "",
      P4: s.p4Submitted ? "Submitted" : "",
      P5: s.p5Submitted ? "Submitted" : "",
      overall: s.progress.percentage + "%"
    });

  } catch (err) {
    console.error("API /status error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
