import express from "express";
import { readMasterTracking } from "../services/googleSheets.js";

const router = express.Router();

router.get("/:matric", async (req, res) => {
  try {
    const matric = String(req.params.matric || "").trim();

    const students = await readMasterTracking(process.env.SHEET_ID);
    const student = students.find(s => s.matric === matric);

    if (!student) {
      return res.status(404).send("Student not found");
    }

    // IMPORTANT FIX → pass timeline separately
    res.render("student", {
      student,
      timeline: student.timeline
    });

  } catch (err) {
    console.error("ERROR in /student route:", err);
    res.status(500).send("Internal Server Error");
  }
});

export default router;
