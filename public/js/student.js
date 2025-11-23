const API_BASE = "https://amdistudentprogress.onrender.com";

async function checkStatus() {
  const matric = document.getElementById("matric").value.trim();
  const result = document.getElementById("result");

  if (!matric) {
    result.innerHTML = "<span style='color:red;'>Please enter a matric number.</span>";
    return;
  }

  result.innerHTML = "Checking...";

  try {
    const res = await fetch(`${API_BASE}/api/status?matric=${matric}`);
    const data = await res.json();

    if (!data || !data.matric) {
      result.innerHTML = "<span style='color:red;'>Student not found.</span>";
      return;
    }

    result.innerHTML = `
      <div class="card">
        <h3>${data.studentName} (${data.matric})</h3>
        <p><strong>P1:</strong> ${data.P1 || "Not Submitted"}</p>
        <p><strong>P3:</strong> ${data.P3 || "Not Submitted"}</p>
        <p><strong>P4:</strong> ${data.P4 || "Not Submitted"}</p>
        <p><strong>P5:</strong> ${data.P5 || "Not Submitted"}</p>
        <p><strong>Overall:</strong> ${data.overall || "Not Started"}</p>
      </div>
    `;

  } catch (e) {
    result.innerHTML = "<span style='color:red;'>Error connecting to server.</span>";
  }
}
