// routes/api.js
import express from "express";
import { readMasterTracking } from "../services/googleSheets.js";

const router = express.Router();

/**
 * Health check
 */
router.get("/", (req, res) => {
  res.json({ ok: true, message: "API is working" });
});

/**
 * GET /api/status?matric=XXXX
 */
router.get("/status", async (req, res) => {
  try {
    const matric = String(req.query.matric || "").trim();
    if (!matric)
      return res.status(400).json({ error: "Missing matric" });

    // Load all student rows
    const students = await readMasterTracking(process.env.SHEET_ID);

    // Find match
    const student = students.find(
      (s) => String(s.matric).trim() === matric
    );

    if (!student) {
      return res.status(404).json({ error: "Student not found" });
    }

    res.json({
      matric: student.matric,
      studentName: student.name,
      programme: student.programme,
      startDate: student.startDate,
      timeline: student.timeline,
      progress: student.progress,
      P1: student.p1Submitted ? "Submitted" : "",
      P3: student.p3Submitted ? "Submitted" : "",
      P4: student.p4Submitted ? "Submitted" : "",
      P5: student.p5Submitted ? "Submitted" : "",
      overall: student.progress.percentage + "%"
    });

  } catch (err) {
    console.error("API /status error:", err);
    res.status(500).json({ error: "Server error" });
  }
});


/**
 * GET /api/all
 */
router.get("/all", async (req, res) => {
  try {
    const students = await readMasterTracking(process.env.SHEET_ID);

    const total = students.length;
    const completed = students.filter(s => s.p5Approved).length;

    const stages = {
      P1: students.filter(s => s.p1Submitted).length,
      P3: students.filter(s => s.p3Submitted).length,
      P4: students.filter(s => s.p4Submitted).length,
      P5: students.filter(s => s.p5Submitted).length,
    };

    const overduration = students.filter(
      s => s.timeline?.status === "Overduration"
    ).length;

    const warning = students.filter(
      s => s.timeline?.status === "Warning"
    ).length;

    res.json({
      total,
      completed,
      stages,
      overduration,
      warning,
      students
    });

  } catch (err) {
    console.error("API /all error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
