// routes/student.js
import express from "express";
import { readMasterTracking } from "../services/googleSheets.js";

const router = express.Router();

router.get("/:matric", async (req, res) => {
  try {
    const matric = String(req.params.matric || "").trim();

    console.log("🔍 Searching matric:", matric);

    const students = await readMasterTracking(process.env.SHEET_ID);

    console.log("📌 Total students loaded:", students.length);

    const student = students.find(
      (s) => String(s.matric).trim() === matric
    );

    if (!student) {
      console.log("❌ Student not found in list");
      return res.status(404).send("Student not found");
    }

    console.log("✅ Student found:", student.name);

    res.render("student", { student });

  } catch (err) {
    console.error("❌ ERROR in /student/:matric:", err);
    res.status(500).send("Internal Server Error");
  }
});

export default router;
