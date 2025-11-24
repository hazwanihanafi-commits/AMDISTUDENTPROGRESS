// routes/api.js
import express from "express";
import { readMasterTracking } from "../services/googleSheets.js";

const router = express.Router();

router.get("/", (req, res) => {
  res.json({ ok: true, message: "API is working" });
});

router.get("/status", async (req, res) => {
  try {
    const matric = String(req.query.matric || "").trim();
    if (!matric)
      return res.status(400).json({ error: "Missing matric" });

    const students = await readMasterTracking(process.env.SHEET_ID);

    const student = students.find(
      (s) => String(s.matric).trim() === matric
    );

    if (!student)
      return res.status(404).json({ error: "Student not found" });

    res.json({
      matric: student.matric,
      studentName: student.name,
      programme: student.programme,
      startDate: student.startDate,
      timeline: student.timeline,
      progress: student.progress
    });

  } catch (err) {
    console.error("API /status error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
