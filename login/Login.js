// ── Show / Hide boxes: Redirect to dedicated pages to avoid code duplication and enhance security ──
function showRegister() {
  window.location.replace("../register/Register.html");
}

function showLogin() {
  window.location.replace("Login.html");
}

// ── Save user to localStorage then redirect ──
function saveUserAndRedirect(user, overrideName = null) {
  const name = overrideName || user.displayName || null;
  localStorage.setItem("hydroUser", JSON.stringify({
    email:    user.email,
    uid:      user.uid   || null,
    name:     name,
    loggedAt: Date.now()
  }));
  window.location.replace("../home/Home.html");
}

function showError(msg) {
  alert("❌ " + msg);
}

// ── Login Form Handler ──
document.querySelector("#loginBox form")?.addEventListener("submit", function (e) {
  e.preventDefault();
  const email = this.querySelector("[type=email]").value.trim();
  const pass  = this.querySelector("[type=password]").value;

  if (!email || !pass) { showError("Please fill all fields"); return; }

  if (typeof firebase !== "undefined" && firebase.auth) {
    firebase.auth().signInWithEmailAndPassword(email, pass)
      .then(cred => saveUserAndRedirect(cred.user))
      .catch(err => {
        if (err.code === "auth/operation-not-supported-in-this-environment") {
          console.warn("Local file:// mode — bypassing Auth.");
          saveUserAndRedirect({ email, uid: "local-bypass-user", displayName: null });
          return;
        }
        const messages = {
          "auth/user-not-found":     "No account found with this email.",
          "auth/wrong-password":     "Incorrect password. Please try again.",
          "auth/invalid-email":      "Invalid email address.",
          "auth/too-many-requests":  "Too many attempts. Please try again later.",
          "auth/invalid-credential": "Incorrect email or password."
        };
        showError(messages[err.code] || err.message);
      });
  } else {
    saveUserAndRedirect({ email, uid: null, displayName: null });
  }
});

// ── Google Login / Sign Up ──
document.getElementById("googleBtn")?.addEventListener("click", function () {
  if (typeof firebase !== "undefined" && firebase.auth) {
    const provider = new firebase.auth.GoogleAuthProvider();
    firebase.auth().signInWithPopup(provider)
      .then(result => saveUserAndRedirect(result.user, result.user.displayName || null))
      .catch(err => {
        if (err.code === "auth/operation-not-supported-in-this-environment") {
          console.warn("Local file:// mode — bypassing Auth.");
          saveUserAndRedirect(
            { email: "google@user.com", uid: "local-bypass-user", displayName: "Google User" },
            "Google User"
          );
          return;
        }
        showError(err.message);
      });
  } else {
    saveUserAndRedirect({ email: "google@user.com", uid: null, displayName: "Google User" }, "Google User");
  }
});

// ── Forgot Password ──
document.querySelector(".forgot")?.addEventListener("click", function (e) {
  e.preventDefault();

  const emailInput = document.querySelector("#loginBox [type=email]");
  const email      = emailInput?.value.trim();

  if (!email) {
    showError("Please enter your email address first, then click Forgot Password.");
    emailInput?.focus();
    return;
  }

  if (typeof firebase !== "undefined" && firebase.auth) {
    firebase.auth().sendPasswordResetEmail(email)
      .then(() => {
        alert(`✅ Password reset email sent to ${email}. Check your inbox.`);
      })
      .catch(err => {
        const messages = {
          "auth/user-not-found": "No account found with this email.",
          "auth/invalid-email":  "Invalid email address."
        };
        showError(messages[err.code] || err.message);
      });
  } else {
    alert("Password reset is not available in offline mode.");
  }
});

// ── Remember Me ──
(function setupRememberMe() {
  const rememberCheckbox = document.getElementById("remember");
  if (!rememberCheckbox) return;

  // Restore saved preference
  const remembered = localStorage.getItem("hydroRememberMe") === "true";
  rememberCheckbox.checked = remembered;

  rememberCheckbox.addEventListener("change", function () {
    localStorage.setItem("hydroRememberMe", this.checked ? "true" : "false");

    if (typeof firebase !== "undefined" && firebase.auth) {
      const persistence = this.checked
        ? firebase.auth.Auth.Persistence.LOCAL
        : firebase.auth.Auth.Persistence.SESSION;

      firebase.auth().setPersistence(persistence).catch(err => {
        console.warn("setPersistence failed:", err.message);
      });
    }
  });

  // Apply saved persistence on page load
  if (typeof firebase !== "undefined" && firebase.auth) {
    const persistence = remembered
      ? firebase.auth.Auth.Persistence.LOCAL
      : firebase.auth.Auth.Persistence.SESSION;
    firebase.auth().setPersistence(persistence).catch(() => {});
  }
})();

