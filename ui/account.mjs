// The account button and dialog: sign in, create an account, sign out.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Same rule as the profiles table in supabase/schema.sql.
const USERNAME_PATTERN = /^[a-z0-9_-]{3,20}$/;
const MIN_PASSWORD = 6;

export const cleanUsername = (text) => text.trim().toLowerCase();

// mode: "signIn" | "signUp". Returns the first problem as a message, or null when the form is fine.
export function checkAccountForm({ mode, email, password, username = "" }) {
  if (!EMAIL_PATTERN.test(email.trim())) return "Enter a valid email address.";
  if (password.length < MIN_PASSWORD) return `Password must be at least ${MIN_PASSWORD} characters.`;
  if (mode === "signUp" && !USERNAME_PATTERN.test(cleanUsername(username))) {
    return "Username must be 3–20 characters: letters, numbers, _ or -.";
  }
  return null;
}

// `api` is the createSupabase adapter. `getName()` is the signed-in username, or null while unknown.
// `onSession(signedIn)` runs after a sign-in, sign-up with a session, or sign-out (the app switches stores).
// `onOpen()` runs before the dialog opens.
export function createAccount({ api, getName, onOpen, onSession }) {
  const dialog = document.querySelector("#account-dialog");
  const title = document.querySelector("#account-title");
  const form = document.querySelector("#account-form");
  const email = document.querySelector("#account-email");
  const password = document.querySelector("#account-password");
  const username = document.querySelector("#account-username");
  const usernameField = document.querySelector("#account-username-field");
  const message = document.querySelector("#account-message");
  const submit = document.querySelector("#account-submit");
  const toggle = document.querySelector("#account-toggle");
  const signedIn = document.querySelector("#account-signed-in");
  const nameElement = document.querySelector("#account-name");
  const signOut = document.querySelector("#account-sign-out");
  const button = document.querySelector("#account-button");
  let mode = "signIn";

  function say(text, info = false) {
    message.textContent = text;
    message.classList.toggle("is-info", info);
  }

  function setMode(next) {
    mode = next;
    const creating = mode === "signUp";
    title.textContent = creating ? "Create account" : "Sign in";
    submit.textContent = creating ? "Create account" : "Sign in";
    toggle.textContent = creating ? "I have an account" : "Create account";
    usernameField.hidden = !creating;
    password.autocomplete = creating ? "new-password" : "current-password";
    say("");
  }

  // Redraws the button and the dialog for whoever is signed in now.
  function refresh() {
    const user = api.user();
    const name = user ? getName() ?? "Account" : null;
    button.textContent = name ?? "Sign in";
    button.setAttribute("aria-label", name ? `Account: ${name}` : "Sign in or create an account");
    form.hidden = user !== null;
    signedIn.hidden = user === null;
    nameElement.textContent = name ?? "";
    title.textContent = user ? "Your account" : mode === "signUp" ? "Create account" : "Sign in";
  }

  function setBusy(busy) {
    submit.disabled = busy;
    toggle.disabled = busy;
    signOut.disabled = busy;
  }

  async function run(task) {
    setBusy(true);
    try {
      await task();
    } catch (error) {
      say(error.message);
    } finally {
      setBusy(false);
    }
  }

  function clearSecrets() {
    password.value = "";
    say("");
  }

  button.addEventListener("click", () => {
    onOpen();
    clearSecrets();
    refresh();
    dialog.showModal();
  });
  dialog.addEventListener("close", clearSecrets);
  toggle.addEventListener("click", () => setMode(mode === "signIn" ? "signUp" : "signIn"));

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const values = { mode, email: email.value, password: password.value, username: username.value };
    const problem = checkAccountForm(values);
    if (problem) {
      say(problem);
      return;
    }
    run(async () => {
      say("");
      if (mode === "signUp") {
        const name = cleanUsername(values.username);
        if (await api.usernameTaken(name)) throw new Error("That username is taken.");
        const created = await api.signUp(values.email.trim(), values.password, name);
        if (!created.signedIn) {
          setMode("signIn");
          say("Check your email to confirm, then sign in.", true);
          return;
        }
      } else {
        await api.signIn(values.email.trim(), values.password);
      }
      password.value = "";
      await onSession(true);
      setMode("signIn");
      refresh();
    });
  });

  signOut.addEventListener("click", () =>
    run(async () => {
      await api.signOut();
      await onSession(false);
      refresh();
    }),
  );

  setMode("signIn");
  refresh();
  return { refresh };
}
