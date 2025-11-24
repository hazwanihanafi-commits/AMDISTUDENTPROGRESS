import express from "express";
import { readMasterTracking } from "../services/googleSheets.js";

const router = express.Router();

router.get("/all", async (req, res) => {
  try {
    const students = await readMasterTracking(process.env.SHEET_ID);
    res.json({ students });
  } catch (err) {
    console.error("API /all error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/status", async (req, res) => {
  try {
    const matric = (req.query.matric || "").trim();
    if (!matric) return res.json({ error: "Matric missing" });

    const students = await readMasterTracking(process.env.SHEET_ID);
    const student = students.find(s => s.matric === matric);

    if (!student) return res.json({ error: "Student not found" });

    res.json(student);

  } catch (err) {
    console.error("API /status error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
