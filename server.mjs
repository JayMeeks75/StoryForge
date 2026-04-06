import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
loadDotEnv(path.join(__dirname, ".env"));

const port = Number(process.env.PORT || process.env.STORYFORGE_PORT || 8788);
const model = process.env.OPENAI_MODEL || "gpt-5-mini";
const appBaseUrl = process.env.APP_BASE_URL || `http://localhost:${port}`;
const datasetRoot = process.env.STORYFORGE_DATASET_ROOT
  ? path.resolve(process.env.STORYFORGE_DATASET_ROOT)
  : path.join(__dirname, "datasets");
const dataRoot = process.env.STORYFORGE_DATA_ROOT
  ? path.resolve(process.env.STORYFORGE_DATA_ROOT)
  : path.join(__dirname, "data");
const billingFile = path.join(dataRoot, "billing.json");
const usageFile = path.join(dataRoot, "usage.json");
const stripeApiVersion = "2026-02-25.clover";
const openAiInputCostPerMillion = Number(process.env.OPENAI_INPUT_COST_PER_MILLION || 0.25);
const openAiOutputCostPerMillion = Number(process.env.OPENAI_OUTPUT_COST_PER_MILLION || 2);
const billingTiers = [
  { id: "free", name: "Free", credits: 1, priceLabel: "Free", priceCents: 0, stripePriceId: "", kind: "free" },
  { id: "starter", name: "Starter", credits: 5, priceLabel: "$4.99", priceCents: 499, stripePriceId: process.env.STRIPE_PRICE_ID_STARTER || "", kind: "paid" },
  { id: "spark", name: "Spark", credits: 15, priceLabel: "$9.99", priceCents: 999, stripePriceId: process.env.STRIPE_PRICE_ID_SPARK || "", kind: "paid" },
  { id: "dream", name: "Dream", credits: 35, priceLabel: "$19.99", priceCents: 1999, stripePriceId: process.env.STRIPE_PRICE_ID_DREAM || "", kind: "paid" },
  { id: "castle", name: "Castle", credits: 75, priceLabel: "$34.99", priceCents: 3499, stripePriceId: process.env.STRIPE_PRICE_ID_CASTLE || "", kind: "paid" },
  { id: "galaxy", name: "Galaxy", credits: 150, priceLabel: "$59.99", priceCents: 5999, stripePriceId: process.env.STRIPE_PRICE_ID_GALAXY || "", kind: "paid" }
];

const datasetSpecs = [
  { key: "english-corpora", label: "English Corpora" },
  { key: "storywars", label: "StoryWars" },
  { key: "common-corpora", label: "Common Corpora" },
  { key: "tiny-stories", label: "TinyStories" },
  { key: "deepmind", label: "DeepMind" }
];

const ageProfiles = {
  "4-5": { minWords: 500, maxWords: 700, targetWords: 550, maxOutputTokens: 1400 },
  "6-7": { minWords: 700, maxWords: 950, targetWords: 850, maxOutputTokens: 1800 },
  "8": { minWords: 950, maxWords: 1200, targetWords: 1100, maxOutputTokens: 2200 }
};

const storyModes = [
  { id: "Classic", label: "Classic Story" },
  { id: "Choose Your Way", label: "Choose Your Way" },
  { id: "Series Builder", label: "Series Builder" }
];

const storyExperiences = {
  Adventure: {
    label: "Adventure",
    family: "Classic",
    mode: "Classic",
    implementationStage: "live",
    dashboardDescription: "Fast-moving quests with bright, playful discoveries.",
    titleStyle: "adventure",
    promptInstructions: [
      "- Keep the pacing playful and full of discovery.",
      "- Build one satisfying adventure arc with a clear ending."
    ]
  },
  Mystery: {
    label: "Mystery",
    family: "Classic",
    mode: "Classic",
    implementationStage: "live",
    dashboardDescription: "Gentle clues, clever teamwork, and a happy reveal.",
    titleStyle: "mystery",
    promptInstructions: [
      "- Include a gentle puzzle with clues a child can follow.",
      "- Reveal the answer in a warm, happy way."
    ]
  },
  Bedtime: {
    label: "Bedtime",
    family: "Classic",
    mode: "Classic",
    implementationStage: "live",
    dashboardDescription: "Soft, cozy winding-down stories for sleepy readers.",
    titleStyle: "bedtime story",
    promptInstructions: [
      "- Keep the tone soothing, comforting, and calm.",
      "- End with a peaceful bedtime landing."
    ]
  },
  AdventureChooseYourWay: {
    label: "Adventure Choose Your Way",
    family: "Interactive",
    mode: "Choose Your Way",
    implementationStage: "planned",
    dashboardDescription: "A branching quest with kid-friendly choices at every turn.",
    titleStyle: "choose-your-way adventure",
    promptInstructions: [
      "- Present a short opening scene followed by 3 child-friendly choices.",
      "- After each choice, continue into a distinct branch and still deliver a complete ending."
    ]
  },
  MysteryChooseYourWay: {
    label: "Mystery Choose Your Way",
    family: "Interactive",
    mode: "Choose Your Way",
    implementationStage: "planned",
    dashboardDescription: "A clue hunt where each choice changes what happens next.",
    titleStyle: "choose-your-way mystery",
    promptInstructions: [
      "- Present a gentle mystery setup followed by 3 branching choices.",
      "- Make each branch feel meaningfully different while staying easy to follow."
    ]
  },
  BedtimeChooseYourWay: {
    label: "Bedtime Choose Your Way",
    family: "Interactive",
    mode: "Choose Your Way",
    implementationStage: "planned",
    dashboardDescription: "A calm, cozy branching bedtime story with gentle decisions.",
    titleStyle: "choose-your-way bedtime story",
    promptInstructions: [
      "- Keep the interactive choices soft, reassuring, and bedtime-friendly.",
      "- Every branch should end peacefully."
    ]
  },
  SeussChooseYourWay: {
    label: "Dr. Seuss-Inspired Choose Your Way",
    family: "Interactive",
    mode: "Choose Your Way",
    implementationStage: "experimental",
    dashboardDescription: "Silly rhymes, whimsical creatures, and playful branching paths.",
    titleStyle: "rhyming choose-your-way story",
    promptInstructions: [
      "- Use original playful rhymes, bouncy rhythm, and whimsical nonsense creatures.",
      "- Capture the energy of classic silly rhyme books without copying any protected phrases or characters.",
      "- Offer 3 playful choices and let each branch feel surprising and fun."
    ]
  },
  SpaceOperaTrilogyChooseYourWay: {
    label: "3-Book Space Opera Choose Your Way",
    family: "Epic",
    mode: "Series Builder",
    implementationStage: "experimental",
    dashboardDescription: "A giant galaxy-spanning adventure mapped as a branching trilogy.",
    titleStyle: "space opera trilogy",
    promptInstructions: [
      "- Structure the output as Book 1, Book 2, and Book 3, each with its own mini arc.",
      "- Include 3 major turning-point choices that redirect the larger trilogy path.",
      "- Keep the scale epic but the language fully kid-safe and understandable."
    ]
  }
};

ensureDatasetFolders();
ensureDataFiles();

export async function handleRequest(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === "GET" && url.pathname === "/api/status") {
      return sendJson(res, 200, getStatusPayload());
    }

    if (req.method === "GET" && url.pathname === "/healthz") {
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === "GET" && url.pathname === "/api/billing/status") {
      return sendJson(res, 200, getBillingStatusPayload());
    }

    if (req.method === "POST" && url.pathname === "/api/billing/checkout-session") {
      const body = await readJsonBody(req);
      return handleCreateCheckoutSession(body, res);
    }

    if (req.method === "POST" && url.pathname === "/api/billing/verify-session") {
      const body = await readJsonBody(req);
      return handleVerifyCheckoutSession(body, res);
    }

    if (req.method === "POST" && url.pathname === "/api/billing/claim-free-tier") {
      return handleClaimFreeTier(res);
    }

    if (req.method === "POST" && url.pathname === "/api/generate") {
      const body = await readJsonBody(req);
      return handleGenerate(body, res);
    }

    if (req.method === "GET") {
      return serveStatic(url.pathname, res);
    }

    sendJson(res, 405, { error: "Method not allowed." });
  } catch (error) {
    console.error(error);
    if (error instanceof SyntaxError) {
      return sendJson(res, 400, {
        error: "Request body must be valid JSON."
      });
    }
    sendJson(res, 500, {
      error: "StoryForge hit an unexpected server error.",
      details: error.message
    });
  }
}

export function startServer() {
  const server = http.createServer(handleRequest);
  server.listen(port, () => {
    console.log(`StoryForge Kids is running at http://localhost:${port}`);
  });
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  startServer();
}

async function handleGenerate(payload, res) {
  if (!process.env.OPENAI_API_KEY) {
    return sendJson(res, 500, {
      error: "OPENAI_API_KEY is missing. Add it to your environment before generating stories."
    });
  }

  const validationError = validateSelections(payload);
  if (validationError) {
    return sendJson(res, 400, { error: validationError });
  }

  const billingState = readBillingState();
  if (isBillingEnabled() && billingState.credits < 1) {
    return sendJson(res, 402, {
      error: "No story credits left. Buy more credits to generate another story."
    });
  }

  const ageProfile = ageProfiles[payload.ageBand];
  const datasets = getDatasetContexts();
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model,
      max_output_tokens: ageProfile.maxOutputTokens,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text:
                "You write child-safe original stories for ages 4 to 8. Keep the language warm, imaginative, and age-appropriate. Never reuse copyrighted passages. Use dataset snippets only as stylistic grounding and inspiration, not as text to copy."
            }
          ]
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: buildPrompt(payload, ageProfile, datasets)
            }
          ]
        }
      ]
    })
  });

  const data = await response.json();
  if (!response.ok) {
    return sendJson(res, response.status, {
      error: data.error?.message || "OpenAI request failed.",
      raw: data
    });
  }

  const storyText = extractOutputText(data).trim();
  if (!storyText) {
    console.error("OpenAI returned no output text", JSON.stringify(data, null, 2));
    return sendJson(res, 502, {
      error: "OpenAI returned no output text.",
      raw: data
    });
  }

  return sendJson(res, 200, {
    title: buildTitle(payload),
    story: storyText,
    ageBand: payload.ageBand,
    storyTypeLabel: getStoryExperience(payload.storyType).label,
    storyMode: payload.storyMode,
    wordRange: `${ageProfile.minWords}-${ageProfile.maxWords}`,
    characterSummary: `${payload.characterName}, ${payload.characterGender.toLowerCase()}, age ${payload.characterAge}, ${payload.hairColor.toLowerCase()} ${payload.hairStyle.toLowerCase()} hair`,
    model,
    datasetSummary: datasets.map((entry) => ({
      label: entry.label,
      fileCount: entry.fileCount,
      snippetCount: entry.snippets.length
    })),
    creditsRemaining: finalizeGenerationAccounting(data, payload)
  });
}

async function handleCreateCheckoutSession(payload, res) {
  const tier = getBillingTier(payload?.tierId);
  if (!tier || tier.kind !== "paid") {
    return sendJson(res, 400, {
      error: "Choose a valid paid tier."
    });
  }

  if (!isBillingEnabledForTier(tier)) {
    return sendJson(res, 400, {
      error: "Stripe billing is not configured yet for that tier."
    });
  }

  const form = new URLSearchParams();
  form.set("mode", "payment");
  form.set("success_url", `${appBaseUrl}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`);
  form.set("cancel_url", `${appBaseUrl}/?checkout=cancel`);
  form.set("line_items[0][price]", tier.stripePriceId);
  form.set("line_items[0][quantity]", "1");
  form.set("metadata[source]", "storyforge-kids");
  form.set("metadata[tier_id]", tier.id);
  form.set("metadata[credit_pack_size]", String(tier.credits));

  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Stripe-Version": stripeApiVersion
    },
    body: form.toString()
  });

  const data = await response.json();
  if (!response.ok) {
    return sendJson(res, response.status, {
      error: data.error?.message || "Stripe Checkout session creation failed."
    });
  }

  return sendJson(res, 200, { url: data.url });
}

async function handleVerifyCheckoutSession(payload, res) {
  if (!isAnyPaidTierEnabled()) {
    return sendJson(res, 400, { error: "Stripe billing is not configured yet." });
  }

  if (!payload?.sessionId) {
    return sendJson(res, 400, { error: "Missing sessionId." });
  }

  const response = await fetch(`https://api.stripe.com/v1/checkout/sessions/${payload.sessionId}`, {
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      "Stripe-Version": stripeApiVersion
    }
  });

  const data = await response.json();
  if (!response.ok) {
    return sendJson(res, response.status, {
      error: data.error?.message || "Stripe session verification failed."
    });
  }

  if (data.payment_status !== "paid") {
    return sendJson(res, 400, { error: "Checkout session is not paid yet." });
  }

  const billingState = readBillingState();
  if (!billingState.processedSessions.includes(data.id)) {
    const tier = getBillingTier(data.metadata?.tier_id) || billingTiers[1];
    billingState.credits += tier.credits;
    billingState.totalPaidCents += data.amount_total || 0;
    billingState.processedSessions.push(data.id);
    billingState.lastCheckoutId = data.id;
    billingState.updatedAt = new Date().toISOString();
    writeJsonFile(billingFile, billingState);
  }

  return sendJson(res, 200, {
    ok: true,
    credits: billingState.credits,
    totalPaidCents: billingState.totalPaidCents
  });
}

function handleClaimFreeTier(res) {
  const billingState = readBillingState();
  const freeTier = getBillingTier("free");

  if (billingState.freeTierClaimed) {
    return sendJson(res, 400, {
      error: "The free tier has already been claimed."
    });
  }

  billingState.credits += freeTier.credits;
  billingState.freeTierClaimed = true;
  billingState.updatedAt = new Date().toISOString();
  writeJsonFile(billingFile, billingState);

  return sendJson(res, 200, {
    ok: true,
    credits: billingState.credits
  });
}

function validateSelections(payload) {
  const requiredFields = [
    "storyType",
    "storyMode",
    "storyTheme",
    "fantasyWorld",
    "characterName",
    "hairColor",
    "hairStyle",
    "characterGender",
    "characterAge",
    "ageBand"
  ];

  for (const field of requiredFields) {
    if (!payload?.[field]) {
      return `Missing required field: ${field}`;
    }
  }

  if (!ageProfiles[payload.ageBand]) {
    return "Unsupported age band.";
  }

  if (!storyExperiences[payload.storyType]) {
    return "Unsupported story experience.";
  }

  if (!storyModes.some((mode) => mode.id === payload.storyMode)) {
    return "Unsupported story mode.";
  }

  return null;
}

function buildPrompt(payload, ageProfile, datasets) {
  const storyExperience = getStoryExperience(payload.storyType);
  const datasetBlock = datasets
    .map((entry) => {
      const snippets = entry.snippets.length
        ? entry.snippets.map((snippet, index) => `  ${index + 1}. ${snippet}`).join("\n")
        : "  No local files found yet.";

      return `${entry.label} (${entry.fileCount} files):\n${snippets}`;
    })
    .join("\n\n");

  return [
    "Create one original StoryForge kids story.",
    `Audience age: ${payload.ageBand}`,
    `Story experience: ${storyExperience.label}`,
    `Requested story mode: ${payload.storyMode}`,
    `Story theme: ${payload.storyTheme}`,
    `Fantasy world: ${payload.fantasyWorld}`,
    `Main character name: ${payload.characterName}`,
    `Main character gender: ${payload.characterGender}`,
    `Main character age: ${payload.characterAge}`,
    `Main character hair color: ${payload.hairColor}`,
    `Main character hair style: ${payload.hairStyle}`,
    `Target word range: ${ageProfile.minWords}-${ageProfile.maxWords}`,
    "",
    "Requirements:",
    "- Write only the final story with a title on the first line.",
    "- Make the story fully child-safe, positive, and easy to understand.",
    "- Keep the plot complete with a clear beginning, middle, and ending.",
    "- Use the selected character details naturally throughout the story.",
    "- Match the requested story experience and mode, treating it as a separate feature with its own structure.",
    "- Reflect the dataset influences only through tone, pacing, vocabulary, and scene style.",
    "- Do not mention datasets, prompts, or AI.",
    ...storyExperience.promptInstructions,
    "",
    "Local dataset context:",
    datasetBlock
  ].join("\n");
}

function buildTitle(payload) {
  const storyExperience = getStoryExperience(payload.storyType);
  return `${payload.characterName}'s ${storyExperience.titleStyle} in ${payload.fantasyWorld}`;
}

function finalizeGenerationAccounting(openAiResponse, payload) {
  const usageState = readUsageState();
  const billingState = readBillingState();
  const usage = openAiResponse.usage || {};
  const inputTokens = usage.input_tokens || 0;
  const outputTokens = usage.output_tokens || 0;
  const estimatedCost =
    (inputTokens / 1000000) * openAiInputCostPerMillion +
    (outputTokens / 1000000) * openAiOutputCostPerMillion;

  usageState.generations.push({
    createdAt: new Date().toISOString(),
    storyType: payload.storyType,
    storyMode: payload.storyMode,
    storyTheme: payload.storyTheme,
    fantasyWorld: payload.fantasyWorld,
    ageBand: payload.ageBand,
    characterName: payload.characterName,
    inputTokens,
    outputTokens,
    estimatedCostUsd: roundCurrency(estimatedCost)
  });
  usageState.totalInputTokens += inputTokens;
  usageState.totalOutputTokens += outputTokens;
  usageState.totalEstimatedCostUsd = roundCurrency(
    usageState.totalEstimatedCostUsd + estimatedCost
  );
  writeJsonFile(usageFile, usageState);

  if (isBillingEnabled()) {
    billingState.credits = Math.max(0, billingState.credits - 1);
    billingState.storiesGenerated += 1;
    billingState.updatedAt = new Date().toISOString();
    writeJsonFile(billingFile, billingState);
  }

  return billingState.credits;
}

function extractOutputText(data) {
  if (typeof data.output_text === "string" && data.output_text.trim()) {
    return normalizeStoryText(data.output_text);
  }

  const parts = [];
  for (const item of data.output || []) {
    if (!Array.isArray(item.content)) {
      continue;
    }

    for (const content of item.content) {
      if ((content.type === "output_text" || content.type === "text") && content.text) {
        parts.push(content.text);
      }
    }
  }

  const uniqueParts = [];
  for (const part of parts) {
    if (!uniqueParts.includes(part)) {
      uniqueParts.push(part);
    }
  }

  return normalizeStoryText(uniqueParts.join("\n").trim());
}

function normalizeStoryText(text) {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  const collapsed = collapseRepeatedHalves(normalized);
  return collapsed.replace(/\n{3,}/g, "\n\n").trim();
}

function collapseRepeatedHalves(text) {
  const midpoint = Math.floor(text.length / 2);
  if (text.length < 400 || text.length % 2 !== 0) {
    return text;
  }

  const firstHalf = text.slice(0, midpoint).trim();
  const secondHalf = text.slice(midpoint).trim();
  if (firstHalf && firstHalf === secondHalf) {
    return firstHalf;
  }

  return text;
}

function getStatusPayload() {
  const datasets = getDatasetContexts();
  return {
    ok: true,
    port,
    model,
    apiKeyConfigured: Boolean(process.env.OPENAI_API_KEY),
    config: {
      ageRanges: Object.fromEntries(
        Object.entries(ageProfiles).map(([key, profile]) => [
          key,
          `${profile.minWords}-${profile.maxWords} words`
        ])
      ),
      storyModes,
      storyExperiences: Object.entries(storyExperiences).map(([id, experience]) => ({
        id,
        label: experience.label,
        family: experience.family,
        description: experience.dashboardDescription,
        recommendedMode: experience.mode,
        implementationStage: experience.implementationStage
      }))
    },
    datasets: datasets.map((entry) => ({
      key: entry.key,
      label: entry.label,
      folder: path.relative(__dirname, entry.folderPath),
      fileCount: entry.fileCount,
      ready: entry.fileCount > 0
    }))
  };
}

function getBillingStatusPayload() {
  const billingState = readBillingState();
  const usageState = readUsageState();

  return {
    enabled: isAnyPaidTierEnabled(),
    credits: billingState.credits,
    freeTierClaimed: billingState.freeTierClaimed,
    totalPaidCents: billingState.totalPaidCents,
    storiesGenerated: billingState.storiesGenerated,
    totalInputTokens: usageState.totalInputTokens,
    totalOutputTokens: usageState.totalOutputTokens,
    totalEstimatedCostUsd: usageState.totalEstimatedCostUsd,
    recentGenerations: usageState.generations.slice(-5).reverse(),
    tiers: billingTiers.map((tier) => ({
      id: tier.id,
      name: tier.name,
      credits: tier.credits,
      priceLabel: tier.priceLabel,
      kind: tier.kind,
      available: tier.kind === "free" ? !billingState.freeTierClaimed : Boolean(tier.stripePriceId && process.env.STRIPE_SECRET_KEY)
    }))
  };
}

function getStoryExperience(storyType) {
  return storyExperiences[storyType] || storyExperiences.Adventure;
}

function getDatasetContexts() {
  return datasetSpecs.map((spec) => {
    const folderPath = path.join(datasetRoot, spec.key);
    const files = listDatasetFiles(folderPath);
    return {
      key: spec.key,
      label: spec.label,
      folderPath,
      fileCount: files.length,
      snippets: collectSnippets(files, 3)
    };
  });
}

function ensureDatasetFolders() {
  if (!fs.existsSync(datasetRoot)) {
    fs.mkdirSync(datasetRoot, { recursive: true });
  }

  for (const spec of datasetSpecs) {
    const folderPath = path.join(datasetRoot, spec.key);
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }
  }
}

function ensureDataFiles() {
  if (!fs.existsSync(dataRoot)) {
    fs.mkdirSync(dataRoot, { recursive: true });
  }

  if (!fs.existsSync(billingFile)) {
    writeJsonFile(billingFile, defaultBillingState());
  }

  if (!fs.existsSync(usageFile)) {
    writeJsonFile(usageFile, defaultUsageState());
  }
}

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (key && !process.env[key]) {
      process.env[key] = value;
    }
  }
}

function listDatasetFiles(rootDir) {
  if (!fs.existsSync(rootDir)) {
    return [];
  }

  const supported = new Set([".txt", ".md", ".jsonl", ".json", ".csv"]);
  const results = [];
  const stack = [rootDir];

  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (supported.has(path.extname(entry.name).toLowerCase())) {
        results.push(fullPath);
      }
    }
  }

  return results.slice(0, 30);
}

function defaultBillingState() {
  return {
    credits: 0,
    freeTierClaimed: false,
    totalPaidCents: 0,
    storiesGenerated: 0,
    processedSessions: [],
    lastCheckoutId: null,
    updatedAt: new Date().toISOString()
  };
}

function defaultUsageState() {
  return {
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalEstimatedCostUsd: 0,
    generations: []
  };
}

function readBillingState() {
  const state = readJsonFile(billingFile, {});
  return {
    ...defaultBillingState(),
    ...state,
    processedSessions: Array.isArray(state.processedSessions) ? state.processedSessions : []
  };
}

function readUsageState() {
  const state = readJsonFile(usageFile, {});
  return {
    ...defaultUsageState(),
    ...state,
    generations: Array.isArray(state.generations) ? state.generations : []
  };
}

function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJsonFile(filePath, payload) {
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
}

function isAnyPaidTierEnabled() {
  return billingTiers.some((tier) => tier.kind === "paid" && isBillingEnabledForTier(tier));
}

function isBillingEnabled() {
  return true;
}

function isBillingEnabledForTier(tier) {
  return Boolean(process.env.STRIPE_SECRET_KEY && tier?.stripePriceId);
}

function getBillingTier(tierId) {
  return billingTiers.find((tier) => tier.id === tierId);
}

function roundCurrency(value) {
  return Math.round(value * 10000) / 10000;
}

function collectSnippets(files, limit) {
  const snippets = [];

  for (const filePath of files) {
    for (const snippet of extractSnippetsFromFile(filePath)) {
      snippets.push(snippet);
      if (snippets.length >= limit) {
        return snippets;
      }
    }
  }

  return snippets;
}

function extractSnippetsFromFile(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const raw = fs.readFileSync(filePath, "utf8");

  if (extension === ".txt" || extension === ".md" || extension === ".csv") {
    return textToSnippets(raw);
  }

  if (extension === ".jsonl") {
    const lines = raw.split(/\r?\n/).filter(Boolean);
    const values = [];
    for (const line of lines.slice(0, 20)) {
      try {
        values.push(...extractTextValues(JSON.parse(line)));
      } catch {
        values.push(line);
      }
    }
    return values.map(cleanSnippet).filter(Boolean).slice(0, 6);
  }

  if (extension === ".json") {
    try {
      return extractTextValues(JSON.parse(raw)).map(cleanSnippet).filter(Boolean).slice(0, 6);
    } catch {
      return textToSnippets(raw);
    }
  }

  return [];
}

function textToSnippets(raw) {
  return raw
    .split(/\r?\n+/)
    .map(cleanSnippet)
    .filter((line) => line.length >= 40)
    .slice(0, 6);
}

function cleanSnippet(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 280);
}

function extractTextValues(value) {
  if (typeof value === "string") {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => extractTextValues(item));
  }

  if (value && typeof value === "object") {
    const preferredKeys = ["text", "story", "content", "body", "prompt", "completion"];
    const values = [];

    for (const key of preferredKeys) {
      if (typeof value[key] === "string") {
        values.push(value[key]);
      }
    }

    if (values.length) {
      return values;
    }

    return Object.values(value).flatMap((item) => extractTextValues(item));
  }

  return [];
}

function serveStatic(requestPath, res) {
  const normalized = requestPath === "/" ? "/index.html" : requestPath;
  const filePath = path.join(__dirname, path.normalize(normalized).replace(/^(\.\.[/\\])+/, ""));

  if (!filePath.startsWith(__dirname)) {
    return sendJson(res, 403, { error: "Forbidden path." });
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    return sendJson(res, 404, { error: "Not found." });
  }

  res.writeHead(200, {
    "Content-Type": getContentType(filePath),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  fs.createReadStream(filePath).pipe(res);
}

function getContentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return (
    {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "application/javascript; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".md": "text/markdown; charset=utf-8"
    }[extension] || "text/plain; charset=utf-8"
  );
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  res.end(body);
}
