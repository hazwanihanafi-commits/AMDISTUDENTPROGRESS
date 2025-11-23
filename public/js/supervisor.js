const API_BASE = "https://amdistudentprogress.onrender.com";

async function approve() {
  const svpass = document.getElementById("svpass").value.trim();
  const matric = document.getElementById("matric").value.trim();
  const stage = document.getElementById("stage").value;
  const statusBox = document.getElementById("status");

  if (!svpass || !matric) {
    statusBox.innerHTML = "<span style='color:red;'>All fields are required.</span>";
    return;
  }

  statusBox.innerHTML = "Submitting...";

  try {
    const res = await fetch(`${API_BASE}/api/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ svpass, matric, stage })
    });

    const data = await res.json();

    if (data.status === "ok") {
      statusBox.innerHTML = `<span style='color:green;'>✔ ${stage} approved for ${matric}</span>`;
    } else {
      statusBox.innerHTML = `<span style='color:red;'>${data.message || "Error"}</span>`;
    }

  } catch (e) {
    statusBox.innerHTML = "<span style='color:red;'>Server error.</span>";
  }
}
