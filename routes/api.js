import express from "express";
import { readMasterTracking } from "../services/googleSheets.js";

const router = express.Router();

router.get("/all", async (req, res) => {
  try {
    const students = await readMasterTracking(process.env.SHEET_ID);

    const total = students.length;
    const completed = students.filter(s => s.progress.level === "P5" && s.p5Approved).length;

    const stages = {
      P1: students.filter(s => s.p1Submitted || s.p1Approved).length,
      P3: students.filter(s => s.p3Submitted || s.p3Approved).length,
      P4: students.filter(s => s.p4Submitted || s.p4Approved).length,
      P5: students.filter(s => s.p5Submitted || s.p5Approved).length,
    };

    const overduration = students.filter(s => s.progress.level !== "P5" && s.timeline.status === "Overduration").length;
    const warning = students.filter(s => s.progress.level !== "P5" && s.timeline.status === "Warning").length;

    res.json({
      total,
      completed,
      stages,
      overduration,
      warning,
      students,
    });
  } catch (err) {
    console.error("API /all error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
