// ── Auth Guard: redirect already-logged-in users away from register page ──
(function () {
  if (localStorage.getItem("hydroUser")) {
    window.location.replace("../home/Home.html");
  }
})();

// ── Save user to localStorage then redirect to Home ──
function saveUserAndRedirect(user, overrideName = null) {
  localStorage.setItem("hydroUser", JSON.stringify({
    email:    user.email,
    uid:      user.uid      || null,
    name:     overrideName  || user.displayName || null,
    loggedAt: Date.now()
  }));
  window.location.replace("../home/Home.html");
}

function showError(msg) {
  alert("❌ " + msg);
}

// ── Register Form Handler ──
document.getElementById("registerForm")?.addEventListener("submit", function (e) {
  e.preventDefault();
  const name    = document.getElementById("regName")?.value.trim()    || "";
  const email   = document.getElementById("regEmail")?.value.trim()   || "";
  const pass    = document.getElementById("regPassword")?.value       || "";
  const confirm = document.getElementById("regConfirm")?.value        || "";

  if (!name)             { showError("Please enter your full name");              return; }
  if (!email || !pass)   { showError("Please fill all fields");                   return; }
  if (pass !== confirm)  { showError("Passwords don't match");                    return; }
  if (pass.length < 6)   { showError("Password must be at least 6 characters");  return; }

  if (typeof firebase !== "undefined" && firebase.auth) {
    firebase.auth().createUserWithEmailAndPassword(email, pass)
      .then(cred => cred.user.updateProfile({ displayName: name }).then(() => cred.user))
      .then(user  => {
        saveUserAndRedirect(user, name);
      })
      .catch(err => {
        if (err.code === "auth/operation-not-supported-in-this-environment") {
          console.warn("Local file:// mode — bypassing Auth.");
          saveUserAndRedirect({ email, uid: "local-bypass-user" }, name);
          return;
        }
        const messages = {
          "auth/email-already-in-use": "This email is already registered. Try logging in.",
          "auth/weak-password":        "Password is too weak.",
          "auth/invalid-email":        "Invalid email address."
        };
        showError(messages[err.code] || err.message);
      });
  } else {
    saveUserAndRedirect({ email, uid: null }, name);
  }
});

// ── Google Sign Up ──
document.getElementById("googleBtn")?.addEventListener("click", function () {
  if (typeof firebase !== "undefined" && firebase.auth) {
    const provider = new firebase.auth.GoogleAuthProvider();
    firebase.auth().signInWithPopup(provider)
      .then(result => {
        saveUserAndRedirect(result.user, result.user.displayName || null);
      })
      .catch(err => {
        if (err.code === "auth/operation-not-supported-in-this-environment") {
          console.warn("Local file:// mode — bypassing Auth.");
          saveUserAndRedirect({ email: "google@user.com", uid: "local-bypass-user" }, "Google User");
          return;
        }
        showError(err.message);
      });
  } else {
    saveUserAndRedirect({ email: "google@user.com", uid: null }, "Google User");
  }
});
