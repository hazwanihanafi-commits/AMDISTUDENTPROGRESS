// routes/api.js
import express from "express";
import { readMasterTracking } from "../services/googleSheets.js";

const router = express.Router();

/**
 * GET /api/status?matric=XXXX
 * Returns single student status
 */
router.get("/status", async (req, res) => {
  try {
    const matric = (req.query.matric || "").trim();

    if (!matric) {
      return res.status(400).json({ error: "Matric required" });
    }

    const students = await readMasterTracking(process.env.SHEET_ID);

    const student = students.find(
      (s) => String(s.matric).trim() === matric
    );

    if (!student) {
      return res.status(404).json({ error: "Student not found" });
    }

    return res.json({
      matric: student.matric,
      studentName: student.name,
      P1: student.p1Submitted ? "Submitted" : "",
      P3: student.p3Submitted ? "Submitted" : "",
      P4: student.p4Submitted ? "Submitted" : "",
      P5: student.p5Submitted ? "Submitted" : "",
      overall: student.progress?.percentage
        ? student.progress.percentage + "%"
        : "0%"
    });

  } catch (err) {
    console.error("API /status error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * GET /api/all
 * Returns ALL students list
 */
router.get("/all", async (req, res) => {
  try {
    const students = await readMasterTracking(process.env.SHEET_ID);

    return res.json({
      count: students.length,
      students,
    });

  } catch (err) {
    console.error("API /all error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
