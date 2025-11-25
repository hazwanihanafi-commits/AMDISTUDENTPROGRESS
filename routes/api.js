// routes/api.js
import express from "express";
import { readMasterTracking } from "../services/googleSheets.js";

const router = express.Router();

router.get("/all", async (req, res) => {
  try {
    const students = await readMasterTracking(process.env.SHEET_ID);

    const total = students.length;

    const stages = {
      P1: students.filter(s => s.p1).length,
      P3: students.filter(s => s.p3).length,
      P4: students.filter(s => s.p4).length,
      P5: students.filter(s => s.p5).length
    };

    const completed = students.filter(s => s.p5).length;

    res.json({
      total,
      completed,
      stages,
      students
    });

  } catch (err) {
    console.error("API /all error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
