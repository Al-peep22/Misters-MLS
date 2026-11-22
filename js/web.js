// js/web.js
const VALID_USERS = [
  { username: "misters_admin", password: "secret123" },
  { username: "mcw", password: "mcw" }
];

document.addEventListener("DOMContentLoaded", () => {
  const loginForm = document.getElementById("loginForm");
  if (!loginForm) return;

  loginForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const user = document.getElementById("username").value.trim();
    const pass = document.getElementById("password").value.trim();

    const match = VALID_USERS.find(
      u => u.username === user && u.password === pass
    );

    if (match) {
      // save session (simple)
      localStorage.setItem("mistersUser", user);
      window.location.href = "schedules.html";
    } else {
      document.getElementById("loginError").textContent =
        "Invalid username or password.";
    }
  });
});
