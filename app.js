const dashboardColumns = [
  {
    id: "live",
    label: "Live",
    description: "Ready-to-run lanes you can use as the current foundation."
  },
  {
    id: "planned",
    label: "Planned",
    description: "Next-up features that fit the product directly."
  },
  {
    id: "experimental",
    label: "Experimental",
    description: "Stretch concepts you can shape however you want."
  }
];

const fallbackConfig = {
  ageRanges: {
    "4-5": "500-700 words",
    "6-7": "700-950 words",
    "8": "950-1200 words"
  },
  storyModes: [
    { id: "Classic", label: "Classic Story" },
    { id: "Choose Your Way", label: "Choose Your Way" },
    { id: "Series Builder", label: "Series Builder" }
  ],
  storyExperiences: [
    {
      id: "Adventure",
      label: "Adventure",
      family: "Classic",
      description: "Fast-moving quests with bright, playful discoveries.",
      recommendedMode: "Classic",
      implementationStage: "live"
    }
  ]
};

let appConfig = fallbackConfig;

const form = document.querySelector("#story-form");
const wordTarget = document.querySelector("#word-target");
const storyOutput = document.querySelector("#story-output");
const generateButton = document.querySelector("#generate-button");
const creditBalance = document.querySelector("#credit-balance");
const billingSummary = document.querySelector("#billing-summary");
const tierList = document.querySelector("#tier-list");
const storyTypeGrid = document.querySelector("#story-type-grid");
const storyTypeSummary = document.querySelector("#story-type-summary");
const modeSummary = document.querySelector("#mode-summary");
const featureDashboard = document.querySelector("#feature-dashboard");
const modeFieldset = document.querySelector("#story-mode-group");

form.addEventListener("submit", handleGenerate);
form.addEventListener("change", updateUiState);
storyTypeGrid.addEventListener("change", syncRecommendedMode);
featureDashboard.addEventListener("click", handleDashboardAction);

initialize();

async function initialize() {
  renderStoryExperiences();
  renderStoryModes();
  renderFeatureDashboard();
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
      renderStoryModes();
      renderFeatureDashboard();
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
  const storyModes = Array.isArray(config.storyModes) && config.storyModes.length
    ? config.storyModes
    : fallbackConfig.storyModes;

  return {
    ageRanges: config.ageRanges || fallbackConfig.ageRanges,
    storyModes,
    storyExperiences
  };
}

function updateUiState() {
  const selections = getSelections();
  const storyExperience = getStoryExperience(selections.storyType);
  const targetRange = appConfig.ageRanges[selections.ageBand] || fallbackConfig.ageRanges[selections.ageBand];

  wordTarget.textContent = `Target: ${targetRange}`;
  storyTypeSummary.textContent = `${storyExperience.label}: ${storyExperience.description}`;
  modeSummary.textContent = `${selections.storyMode} mode for ${storyExperience.label}`;
  renderFeatureDashboard();
}

function renderStoryExperiences() {
  const experiences = appConfig.storyExperiences;
  const selectedExperience = getSelections().storyType || experiences[0]?.id;

  storyTypeGrid.innerHTML = experiences
    .map(
      (experience) => `
        <label class="story-type-card">
          <input
            type="radio"
            name="storyType"
            value="${escapeHtml(experience.id)}"
            ${experience.id === selectedExperience ? "checked" : ""}
          >
          <span class="story-type-family">${escapeHtml(experience.family)}</span>
          <strong>${escapeHtml(experience.label)}</strong>
          <span class="story-type-description">${escapeHtml(experience.description)}</span>
        </label>
      `
    )
    .join("");
}

function renderStoryModes() {
  const selectedMode = getSelections().storyMode || appConfig.storyModes[0]?.id;
  const modeGrid = modeFieldset.querySelector(".choice-grid");

  modeGrid.innerHTML = appConfig.storyModes
    .map(
      (mode) => `
        <label>
          <input
            type="radio"
            name="storyMode"
            value="${escapeHtml(mode.id)}"
            ${mode.id === selectedMode ? "checked" : ""}
          >
          ${escapeHtml(mode.label)}
        </label>
      `
    )
    .join("");
}

function syncRecommendedMode() {
  const selections = getSelections();
  const storyExperience = getStoryExperience(selections.storyType);
  const recommendedInput = form.querySelector(
    `input[name="storyMode"][value="${cssEscape(storyExperience.recommendedMode)}"]`
  );

  if (recommendedInput) {
    recommendedInput.checked = true;
  }

  updateUiState();
}

function renderFeatureDashboard() {
  const selections = getSelections();

  featureDashboard.innerHTML = dashboardColumns
    .map((column) => {
      const cards = appConfig.storyExperiences
        .filter((experience) => experience.implementationStage === column.id)
        .map((experience) => {
          const isActive = experience.id === selections.storyType;

          return `
            <article class="feature-card${isActive ? " active" : ""}">
              <div class="feature-card-top">
                <span class="story-type-family">${escapeHtml(experience.family)}</span>
                <span class="feature-mode-pill">${escapeHtml(experience.recommendedMode)}</span>
              </div>
              <h3>${escapeHtml(experience.label)}</h3>
              <p>${escapeHtml(experience.description)}</p>
              <button
                type="button"
                class="feature-select-button"
                data-story-id="${escapeHtml(experience.id)}"
                data-story-mode="${escapeHtml(experience.recommendedMode)}"
              >${isActive ? "Selected" : "Use This"}</button>
            </article>
          `;
        })
        .join("");

      return `
        <section class="dashboard-column dashboard-column-${escapeHtml(column.id)}">
          <div class="dashboard-column-header">
            <h3>${escapeHtml(column.label)}</h3>
            <p>${escapeHtml(column.description)}</p>
          </div>
          <div class="dashboard-column-cards">
            ${cards || '<p class="empty-state">No features in this lane yet.</p>'}
          </div>
        </section>
      `;
    })
    .join("");
}

function handleDashboardAction(event) {
  const button = event.target.closest("[data-story-id]");
  if (!button) {
    return;
  }

  const storyInput = form.querySelector(
    `input[name="storyType"][value="${cssEscape(button.dataset.storyId)}"]`
  );
  const modeInput = form.querySelector(
    `input[name="storyMode"][value="${cssEscape(button.dataset.storyMode)}"]`
  );

  if (storyInput) {
    storyInput.checked = true;
  }

  if (modeInput) {
    modeInput.checked = true;
  }

  updateUiState();
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
            <span>${escapeHtml(tier.credits)} credits • ${escapeHtml(tier.priceLabel)}</span>
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
    <p><strong>Target range:</strong> ${escapeHtml(data.wordRange)}</p>
    <p><strong>Character:</strong> ${escapeHtml(data.characterSummary)}</p>
    <p><strong>Credits remaining:</strong> ${escapeHtml(data.creditsRemaining)}</p>
    <ul>${datasetItems}</ul>
    <p class="story-text">${escapeHtml(data.story)}</p>
  `;
}

function getSelections() {
  const formData = new FormData(form);
  const defaultExperience = appConfig.storyExperiences[0];
  const defaultMode = appConfig.storyModes[0];

  return {
    storyType: formData.get("storyType") || defaultExperience?.id || "Adventure",
    storyMode: formData.get("storyMode") || defaultMode?.id || "Classic",
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

function cssEscape(value) {
  return String(value ?? "").replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}
