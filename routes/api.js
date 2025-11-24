// routes/api.js
import express from "express";
import { readMasterTracking } from "../services/googleSheets.js";
const router = express.Router();

router.get("/all", async (req, res) => {
  try {
    const students = await readMasterTracking(process.env.SHEET_ID);
    const total = students.length;
    const completed = students.filter(s => s.p5Approved).length;
    const stages = {
      P1: students.filter(s => s.p1Submitted || s.p1Approved).length,
      P3: students.filter(s => s.p3Submitted || s.p3Approved).length,
      P4: students.filter(s => s.p4Submitted || s.p4Approved).length,
      P5: students.filter(s => s.p5Submitted || s.p5Approved).length,
    };
    const overduration = students.filter(s => !s.p5Approved && s.timeline && s.timeline.status === "Overduration").length;
    const warning = students.filter(s => !s.p5Approved && s.timeline && s.timeline.status === "Warning").length;
    res.json({ total, completed, stages, overduration, warning, students });
  } catch (err) {
    console.error("API /all error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/status", async (req, res) => {
  try {
    const matric = String(req.query.matric || "").trim();
    if (!matric) return res.status(400).json({ error: "Matric required" });
    const students = await readMasterTracking(process.env.SHEET_ID);
    const student = students.find(s => String(s.matric).trim() === matric);
    if (!student) return res.status(404).json({ error: "Student not found" });
    return res.json({
      matric: student.matric,
      studentName: student.name,
      programme: student.programme,
      startDate: student.startDate,
      P1_Submitted: student.p1Submitted,
      P1_Approved: student.p1Approved,
      P3_Submitted: student.p3Submitted,
      P3_Approved: student.p3Approved,
      P4_Submitted: student.p4Submitted,
      P4_Approved: student.p4Approved,
      P5_Submitted: student.p5Submitted,
      P5_Approved: student.p5Approved,
      overallPercentage: student.progress && student.progress.percentage,
      progressLevel: student.progress && student.progress.level,
      timelineStatus: student.timeline && student.timeline.status
    });
  } catch (err) {
    console.error("API /status error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
