const quickStoryOptions = {
  LostAtWalmart: {
    id: "LostAtWalmart",
    label: "Lost at Walmart",
    mode: "Choose Your Way",
    description: "A quick story about getting separated in a big store and finding your way back."
  },
  ImASuperhero: {
    id: "ImASuperhero",
    label: "I'm a Super Hero",
    mode: "Choose Your Way",
    description: "A quick story where the kid discovers powers and chooses how to help."
  },
  AliensTookMe: {
    id: "AliensTookMe",
    label: "Aliens Took Me",
    mode: "Choose Your Way",
    description: "A quick story about a surprise alien ride and safe choices home."
  }
};

const fallbackConfig = {
  ageRanges: {
    "4-5": "500-700 words",
    "6-7": "700-950 words",
    "8": "950-1200 words"
  },
  storyExperiences: [
    {
      id: "Adventure",
      label: "Adventure",
      family: "Classic",
      description: "Fast-moving quests with bright, playful discoveries.",
      recommendedMode: "Classic"
    },
    {
      id: "Bedtime",
      label: "Bedtime",
      family: "Classic",
      description: "Soft, cozy winding-down stories for sleepy readers.",
      recommendedMode: "Classic"
    },
    {
      id: "Mystery",
      label: "Mystery",
      family: "Classic",
      description: "Gentle clues, clever teamwork, and a happy reveal.",
      recommendedMode: "Classic"
    },
    ...Object.values(quickStoryOptions).map((entry) => ({
      id: entry.id,
      label: entry.label,
      family: "Choose Your Way",
      description: entry.description,
      recommendedMode: entry.mode
    }))
  ]
};

let appConfig = fallbackConfig;
const authUsersStorageKey = "storyforge_auth_users_v1";
const authSessionStorageKey = "storyforge_auth_session_v1";
const authPendingSignupStorageKey = "storyforge_auth_pending_signup_v1";

const form = document.querySelector("#story-form");
const storyOutput = document.querySelector("#story-output");
const generateButton = document.querySelector("#generate-button");
const creditBalance = document.querySelector("#credit-balance");
const billingSummary = document.querySelector("#billing-summary");
const tierList = document.querySelector("#tier-list");
const storyTypeSummary = document.querySelector("#story-type-summary");
const modeSummary = document.querySelector("#mode-summary");

const classicTypeSelect = document.querySelector("#classic-type-select");
const cywTypeSelect = document.querySelector("#cyw-type-select");
const storyModeHidden = document.querySelector("#story-mode-hidden");
const storyTypeHidden = document.querySelector("#story-type-hidden");

const classicThemeGroup = document.querySelector("#classic-theme-group");
const classicWorldGroup = document.querySelector("#classic-world-group");
const classicLookGroup = document.querySelector("#classic-look-group");
const authForm = document.querySelector("#auth-form");
const authEmailInput = document.querySelector("#auth-email");
const authPasswordInput = document.querySelector("#auth-password");
const authCodeInput = document.querySelector("#auth-code");
const signupButton = document.querySelector("#signup-button");
const signinButton = document.querySelector("#signin-button");
const signoutButton = document.querySelector("#signout-button");
const verifyButton = document.querySelector("#verify-button");
const authStatus = document.querySelector("#auth-status");
let pendingVerificationEmail = "";
let pendingVerificationPassword = "";

form.addEventListener("submit", handleGenerate);
form.addEventListener("change", updateUiState);
classicTypeSelect.addEventListener("change", () => {
  if (classicTypeSelect.value) {
    cywTypeSelect.value = "";
  }
  updateUiState();
});
cywTypeSelect.addEventListener("change", () => {
  updateUiState();
});
signupButton.addEventListener("click", handleSignUp);
signinButton.addEventListener("click", handleSignIn);
signoutButton.addEventListener("click", handleSignOut);
verifyButton.addEventListener("click", handleVerifyEmail);

initialize();

async function initialize() {
  syncAuthUi();
  await handleVerificationFromUrl();
  await loadStatus();
  populateStoryTypeMenus();
  updateUiState();
  await loadBillingStatus();
  await checkCheckoutReturn();
}

async function loadStatus() {
  try {
    const response = await fetch("/api/status");
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Unable to load app status.");
    }

    if (data.config) {
      appConfig = normalizeConfig(data.config);
    }
  } catch (error) {
    storyOutput.innerHTML = `
      <h3>Running in Safe Mode</h3>
      <p>${escapeHtml(error.message || "Status could not be loaded.")}</p>
      <p>Using local fallback configuration so the dashboard still works.</p>
    `;
  }
}

function normalizeConfig(config) {
  const storyExperiences = Array.isArray(config.storyExperiences) && config.storyExperiences.length
    ? config.storyExperiences
    : fallbackConfig.storyExperiences;

  return {
    ageRanges: config.ageRanges || fallbackConfig.ageRanges,
    storyExperiences
  };
}

function populateStoryTypeMenus() {
  const classicIds = ["Adventure", "Bedtime", "Mystery"];
  const cywIds = ["LostAtWalmart", "ImASuperhero", "AliensTookMe"];

  const byId = new Map(appConfig.storyExperiences.map((experience) => [experience.id, experience]));

  const classicItems = classicIds
    .map((id) => byId.get(id))
    .filter(Boolean);

  const quickItems = cywIds
    .map((id) => byId.get(id))
    .filter(Boolean);

  classicTypeSelect.innerHTML = classicItems
    .map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.label)}</option>`)
    .join("");

  cywTypeSelect.innerHTML =
    '<option value="" selected>None</option>' +
    quickItems
      .map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.label)}</option>`)
      .join("");

  if (!classicTypeSelect.value && classicItems[0]) {
    classicTypeSelect.value = classicItems[0].id;
  }
}

function updateUiState() {
  const quickStoryId = cywTypeSelect.value;
  const usingQuickStory = Boolean(quickStoryId);

  if (usingQuickStory) {
    storyModeHidden.value = "Choose Your Way";
    storyTypeHidden.value = quickStoryId;
  } else {
    storyModeHidden.value = "Classic";
    storyTypeHidden.value = classicTypeSelect.value || "Adventure";
  }

  const storyExperience = getStoryExperience(storyTypeHidden.value);

  classicThemeGroup.hidden = usingQuickStory;
  classicWorldGroup.hidden = usingQuickStory;
  classicLookGroup.hidden = usingQuickStory;

  storyTypeSummary.textContent = `${storyExperience.label}: ${storyExperience.description}`;
  modeSummary.textContent = `${storyModeHidden.value} mode for ${storyExperience.label}`;
}

async function loadBillingStatus() {
  try {
    const response = await fetch("/api/billing/status");
    const data = await response.json();

    creditBalance.textContent = `Credits: ${data.credits}`;
    billingSummary.textContent =
      `Stories generated: ${data.storiesGenerated} | Estimated usage cost: $${Number(data.totalEstimatedCostUsd || 0).toFixed(4)}`;
    renderTiers(data.tiers || [], data.freeTierClaimed);
  } catch {
    creditBalance.textContent = "Credits: unavailable";
    billingSummary.textContent = "Usage summary unavailable";
    tierList.innerHTML = "";
  }
}

function renderTiers(tiers, freeTierClaimed) {
  tierList.innerHTML = tiers
    .map((tier) => {
      const buttonLabel = tier.kind === "free" ? "Claim Free" : `Buy ${tier.name}`;
      const disabled = !tier.available;
      const disabledLabel =
        tier.kind === "free" && freeTierClaimed ? "Claimed" : "Unavailable";

      return `
        <div class="tier-card">
          <div class="tier-copy">
            <strong>${escapeHtml(tier.name)}</strong>
            <span>${escapeHtml(tier.credits)} credits - ${escapeHtml(tier.priceLabel)}</span>
          </div>
          <button
            type="button"
            class="tier-button"
            data-tier-id="${escapeHtml(tier.id)}"
            ${disabled ? "disabled" : ""}
          >${escapeHtml(disabled ? disabledLabel : buttonLabel)}</button>
        </div>
      `;
    })
    .join("");

  for (const button of tierList.querySelectorAll(".tier-button")) {
    button.addEventListener("click", () => handleTierAction(button.dataset.tierId, button));
  }
}

async function handleTierAction(tierId, button) {
  button.disabled = true;
  const originalLabel = button.textContent;
  button.textContent = tierId === "free" ? "Claiming..." : "Opening...";

  try {
    const response =
      tierId === "free"
        ? await fetch("/api/billing/claim-free-tier", { method: "POST" })
        : await fetch("/api/billing/checkout-session", {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({ tierId })
          });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Checkout setup failed.");
    }

    if (tierId === "free") {
      storyOutput.innerHTML = `
        <h3>Free Credit Ready</h3>
        <p>Your free story credit has been added.</p>
      `;
      await loadBillingStatus();
      return;
    }

    window.location.href = data.url;
  } catch (error) {
    storyOutput.innerHTML = `
      <h3>Billing Error</h3>
      <p>${escapeHtml(error.message)}</p>
    `;
    await loadBillingStatus();
  } finally {
    button.textContent = originalLabel;
  }
}

async function checkCheckoutReturn() {
  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get("session_id");
  const checkoutState = params.get("checkout");

  if (!sessionId || checkoutState !== "success") {
    return;
  }

  try {
    const response = await fetch("/api/billing/verify-session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ sessionId })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Checkout verification failed.");
    }

    storyOutput.innerHTML = `
      <h3>Credits Added</h3>
      <p>Your payment went through and your story credits are ready.</p>
    `;
  } catch (error) {
    storyOutput.innerHTML = `
      <h3>Billing Error</h3>
      <p>${escapeHtml(error.message)}</p>
    `;
  } finally {
    window.history.replaceState({}, "", window.location.pathname);
    await loadBillingStatus();
  }
}

async function handleGenerate(event) {
  event.preventDefault();
  updateUiState();

  generateButton.disabled = true;
  generateButton.textContent = "Generating...";
  storyOutput.innerHTML = "<h3>Building your story...</h3><p>StoryForge is creating an original kids story.</p>";

  try {
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(getSelections())
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Story generation failed.");
    }

    renderStory(data);
    await loadStatus();
    await loadBillingStatus();
  } catch (error) {
    storyOutput.innerHTML = `
      <h3>Generation Error</h3>
      <p>${escapeHtml(error.message)}</p>
      <p>Make sure StoryForge is running and try again.</p>
    `;
  } finally {
    generateButton.disabled = false;
    generateButton.textContent = "Generate Story";
  }
}

function renderStory(data) {
  const datasetItems = data.datasetSummary
    .map(
      (dataset) =>
        `<li>${dataset.label}: ${dataset.fileCount} file${dataset.fileCount === 1 ? "" : "s"}, ${dataset.snippetCount} snippet${dataset.snippetCount === 1 ? "" : "s"} used for grounding</li>`
    )
    .join("");

  storyOutput.innerHTML = `
    <h3>${escapeHtml(data.title)}</h3>
    <p><strong>Story experience:</strong> ${escapeHtml(data.storyTypeLabel)}</p>
    <p><strong>Story mode:</strong> ${escapeHtml(data.storyMode)}</p>
    <p><strong>Age band:</strong> ${escapeHtml(data.ageBand)}</p>
    <p><strong>Character:</strong> ${escapeHtml(data.characterSummary)}</p>
    <p><strong>Credits remaining:</strong> ${escapeHtml(data.creditsRemaining)}</p>
    <ul>${datasetItems}</ul>
    <p class="story-text">${escapeHtml(data.story)}</p>
  `;
}

function getSelections() {
  const formData = new FormData(form);

  return {
    storyType: formData.get("storyType") || "Adventure",
    storyMode: formData.get("storyMode") || "Classic",
    storyTheme: formData.get("storyTheme") || "Friendship",
    fantasyWorld: formData.get("fantasyWorld") || "Sky Kingdom",
    characterName: formData.get("characterName"),
    hairColor: formData.get("hairColor") || "Brown",
    hairStyle: formData.get("hairStyle") || "Curly",
    characterGender: formData.get("characterGender"),
    characterAge: formData.get("characterAge"),
    ageBand: formData.get("ageBand")
  };
}

function getStoryExperience(id) {
  return (
    appConfig.storyExperiences.find((experience) => experience.id === id) ||
    appConfig.storyExperiences[0] ||
    fallbackConfig.storyExperiences[0]
  );
}

function readAuthUsers() {
  try {
    return JSON.parse(localStorage.getItem(authUsersStorageKey) || "{}");
  } catch {
    return {};
  }
}

function writeAuthUsers(users) {
  localStorage.setItem(authUsersStorageKey, JSON.stringify(users));
}

function getSessionEmail() {
  return localStorage.getItem(authSessionStorageKey) || "";
}

function setSessionEmail(email) {
  if (email) {
    localStorage.setItem(authSessionStorageKey, email);
  } else {
    localStorage.removeItem(authSessionStorageKey);
  }
}

function syncAuthUi() {
  const currentEmail = getSessionEmail();
  const isSignedIn = Boolean(currentEmail);
  authStatus.textContent = isSignedIn ? `Signed in as ${currentEmail}` : "Not signed in.";
  signoutButton.disabled = !isSignedIn;
  verifyButton.disabled = !pendingVerificationEmail;
}

function getAuthInput() {
  const email = String(authEmailInput.value || "").trim().toLowerCase();
  const password = String(authPasswordInput.value || "");
  return { email, password };
}

function readPendingSignups() {
  try {
    return JSON.parse(localStorage.getItem(authPendingSignupStorageKey) || "{}");
  } catch {
    return {};
  }
}

function writePendingSignups(pending) {
  localStorage.setItem(authPendingSignupStorageKey, JSON.stringify(pending));
}

function setPendingSignup(email, password) {
  const pending = readPendingSignups();
  pending[email] = { password, createdAt: new Date().toISOString() };
  writePendingSignups(pending);
}

function popPendingSignup(email) {
  const pending = readPendingSignups();
  const entry = pending[email];
  delete pending[email];
  writePendingSignups(pending);
  return entry;
}

async function handleSignUp() {
  if (!authForm.reportValidity()) {
    return;
  }

  const { email, password } = getAuthInput();
  const users = readAuthUsers();

  if (users[email]) {
    authStatus.textContent = "Account already exists. Sign in instead.";
    return;
  }

  try {
    const response = await fetch("/api/auth/send-verification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Failed to send verification code.");
    }

    pendingVerificationEmail = email;
    pendingVerificationPassword = password;
    setPendingSignup(email, password);
    syncAuthUi();
    if (data.verifyUrl) {
      authStatus.innerHTML = `Verification link ready: <a href="${escapeHtml(data.verifyUrl)}" target="_self">Verify account</a>`;
    } else {
      authStatus.textContent = "Verification code sent. Check email and enter the 6-digit code.";
    }
  } catch (error) {
    authStatus.textContent = error.message || "Could not send verification code.";
  }
}

async function handleVerifyEmail() {
  const code = String(authCodeInput.value || "").trim();
  if (!pendingVerificationEmail) {
    authStatus.textContent = "Start with Sign Up to request a verification code.";
    return;
  }

  if (!/^\d{6}$/.test(code)) {
    authStatus.textContent = "Enter the 6-digit verification code.";
    return;
  }

  try {
    const response = await fetch("/api/auth/verify-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: pendingVerificationEmail, code })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Verification failed.");
    }

    const pendingEntry = popPendingSignup(pendingVerificationEmail);
    if (!pendingEntry?.password) {
      throw new Error("Pending signup not found. Please sign up again.");
    }

    const users = readAuthUsers();
    users[pendingVerificationEmail] = {
      password: pendingEntry.password,
      verified: true,
      verifiedAt: new Date().toISOString()
    };
    writeAuthUsers(users);
    setSessionEmail(pendingVerificationEmail);
    pendingVerificationEmail = "";
    pendingVerificationPassword = "";
    authCodeInput.value = "";
    authPasswordInput.value = "";
    authStatus.textContent = "Email verified and account created.";
    syncAuthUi();
  } catch (error) {
    authStatus.textContent = error.message || "Verification failed.";
  }
}

function handleSignIn() {
  if (!authForm.reportValidity()) {
    return;
  }

  const { email, password } = getAuthInput();
  const users = readAuthUsers();

  if (!users[email] || users[email].password !== password) {
    authStatus.textContent = "Wrong email or password.";
    return;
  }
  if (!users[email].verified) {
    authStatus.textContent = "Please verify your email first.";
    return;
  }

  setSessionEmail(email);
  authPasswordInput.value = "";
  syncAuthUi();
}

function handleSignOut() {
  setSessionEmail("");
  syncAuthUi();
}

async function handleVerificationFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const email = String(params.get("verify_email") || "").trim().toLowerCase();
  const token = String(params.get("verify_token") || "").trim();

  if (!email || !token) {
    return;
  }

  try {
    const response = await fetch("/api/auth/verify-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, token })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Verification link failed.");
    }

    const pendingEntry = popPendingSignup(email);
    if (!pendingEntry?.password) {
      throw new Error("Signup session not found on this device. Sign up again, then verify.");
    }

    const users = readAuthUsers();
    users[email] = {
      password: pendingEntry.password,
      verified: true,
      verifiedAt: new Date().toISOString()
    };
    writeAuthUsers(users);
    setSessionEmail(email);
    authStatus.textContent = "Email verified and account created.";
    window.history.replaceState({}, "", window.location.pathname);
  } catch (error) {
    authStatus.textContent = error.message || "Verification link failed.";
    window.history.replaceState({}, "", window.location.pathname);
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
