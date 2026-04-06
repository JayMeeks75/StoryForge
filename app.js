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
      recommendedMode: "Classic",
      implementationStage: "live"
    },
    {
      id: "AdventureChooseYourWay",
      label: "Adventure Choose Your Way",
      family: "Interactive",
      description: "A branching quest with kid-friendly choices at every turn.",
      recommendedMode: "Choose Your Way",
      implementationStage: "planned"
    }
  ]
};

let appConfig = fallbackConfig;

const form = document.querySelector("#story-form");
const storyOutput = document.querySelector("#story-output");
const generateButton = document.querySelector("#generate-button");
const creditBalance = document.querySelector("#credit-balance");
const billingSummary = document.querySelector("#billing-summary");
const tierList = document.querySelector("#tier-list");
const storyTypeSummary = document.querySelector("#story-type-summary");
const modeSummary = document.querySelector("#mode-summary");
const storyFamilySelect = document.querySelector("#story-family");
const storyTypeSelect = document.querySelector("#story-type-select");
const storyModeHidden = document.querySelector("#story-mode-hidden");

form.addEventListener("submit", handleGenerate);
form.addEventListener("change", updateUiState);
storyFamilySelect.addEventListener("change", () => {
  renderStoryExperiences();
  updateUiState();
});

initialize();

async function initialize() {
  renderStoryExperiences();
  updateUiState();
  await loadStatus();
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
      renderStoryExperiences();
      updateUiState();
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

function getFamilyExperiences(selectedFamily) {
  const family = selectedFamily || "Classic";

  return appConfig.storyExperiences.filter((experience) => {
    const recommendedMode = (experience.recommendedMode || "").toLowerCase();

    if (family === "Classic") {
      return recommendedMode === "classic";
    }

    return recommendedMode === "choose your way";
  });
}

function renderStoryExperiences() {
  const selectedFamily = storyFamilySelect.value || "Classic";
  const experiences = getFamilyExperiences(selectedFamily);
  const previousType = storyTypeSelect.value;

  storyTypeSelect.innerHTML = experiences
    .map(
      (experience) => `<option value="${escapeHtml(experience.id)}">${escapeHtml(experience.label)}</option>`
    )
    .join("");

  if (experiences.some((experience) => experience.id === previousType)) {
    storyTypeSelect.value = previousType;
  }

  if (!storyTypeSelect.value && experiences[0]) {
    storyTypeSelect.value = experiences[0].id;
  }
}

function updateUiState() {
  const selections = getSelections();
  const storyExperience = getStoryExperience(selections.storyType);

  storyModeHidden.value = storyExperience.recommendedMode || "Classic";
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
    storyTheme: formData.get("storyTheme"),
    fantasyWorld: formData.get("fantasyWorld"),
    characterName: formData.get("characterName"),
    hairColor: formData.get("hairColor"),
    hairStyle: formData.get("hairStyle"),
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

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

