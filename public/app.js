const PROFILE_KEY = "linksy.profile.v1";
const form = document.querySelector("#plan-form");
const promptInput = document.querySelector("#prompt");
const resultPanel = document.querySelector("#result-panel");
const errorNode = document.querySelector("#form-error");
const button = document.querySelector("#find-button");
const resultLive = document.querySelector("#result-live");
const demoBadge = document.querySelector(".demo-badge");
const onboarding = document.querySelector("#onboarding-screen");
const discover = document.querySelector("#discover-screen");
const onboardingForm = document.querySelector("#onboarding-form");
const onboardingError = document.querySelector("#onboarding-error");
const goalLabels = {
  activity_partner: "Find an activity partner",
  meet_friends: "Meet new friends through shared activities",
  join_groups: "Join a group activity",
  explore: "Explore a new place with someone",
};
const interestIcons = { coffee: "☕", hiking: "🥾", pickleball: "🏓", "live music": "🎸", food: "🍜", fitness: "🧘", art: "🎨", networking: "🗣️", photography: "📷", "board games": "🎲", running: "🏃", markets: "🛍️" };
let profile = readProfile();
let activePlan = null;
let currentStep = 1;
let editingProfile = false;

function readProfile() {
  try {
    const value = JSON.parse(localStorage.getItem(PROFILE_KEY) || "null");
    return value && typeof value.name === "string" && typeof value.city === "string" ? value : null;
  } catch {
    return null;
  }
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function setBusy(busy) {
  resultPanel.setAttribute("aria-busy", String(busy));
  button.disabled = busy;
  button.innerHTML = busy ? '<span class="button-spinner"></span><span>Finding people &amp; plans</span>' : '<span>Find people &amp; plans</span><span aria-hidden="true">↗</span>';
}

function setError(message = "") {
  errorNode.textContent = message;
  errorNode.hidden = !message;
}

function setOnboardingError(message = "") {
  onboardingError.textContent = message;
  onboardingError.hidden = !message;
}

function setStep(step) {
  currentStep = step;
  document.querySelectorAll(".onboarding-step").forEach((section) => { section.hidden = Number(section.dataset.step) !== step; });
  document.querySelector("#step-count").textContent = `${step} / 3`;
  document.querySelector("#step-label").textContent = `${editingProfile ? "EDIT YOUR PROFILE" : "YOUR PROFILE"} · 0${step} OF 03`;
  document.querySelector("#step-title").textContent = ["Start with you", "Find your kind of fun", "Make time for it"][step - 1];
  document.querySelector("#progress-fill").style.width = `${step / 3 * 100}%`;
  document.querySelector("#back-step").hidden = step === 1;
  document.querySelector("#continue-step").hidden = step === 3;
  document.querySelector("#finish-onboarding").hidden = step !== 3;
  setOnboardingError("");
}

function showOnboarding(edit = false) {
  editingProfile = edit;
  onboarding.hidden = false;
  discover.hidden = true;
  document.querySelector("#profile-trigger").hidden = true;
  populateOnboarding();
  setStep(1);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function selectChoices(selector, values, attribute) {
  const selected = new Set(values || []);
  document.querySelectorAll(selector).forEach((choice) => {
    choice.setAttribute("aria-pressed", String(selected.has(choice.dataset[attribute])));
  });
}

function populateOnboarding() {
  const data = profile || {};
  document.querySelector("#profile-name").value = data.name || "";
  document.querySelector("#profile-city").value = data.city || "";
  document.querySelector("#profile-skill").value = data.skill || "any";
  document.querySelector("#profile-radius").value = data.radius || "nearby";
  const goal = data.socialGoal || "activity_partner";
  const radio = document.querySelector(`input[name="socialGoal"][value="${CSS.escape(goal)}"]`);
  if (radio) radio.checked = true;
  selectChoices(".interest-choice", data.interests, "interest");
  selectChoices(".availability-choice", data.availability, "time");
}

function readProfileFields() {
  return {
    name: document.querySelector("#profile-name").value.trim(),
    city: document.querySelector("#profile-city").value.trim(),
    socialGoal: onboardingForm.querySelector('input[name="socialGoal"]:checked')?.value || "activity_partner",
    interests: [...document.querySelectorAll('.interest-choice[aria-pressed="true"]')].map((choice) => choice.dataset.interest),
    skill: document.querySelector("#profile-skill").value,
    availability: [...document.querySelectorAll('.availability-choice[aria-pressed="true"]')].map((choice) => choice.dataset.time),
    radius: document.querySelector("#profile-radius").value,
  };
}

function showDiscover() {
  if (!profile) return showOnboarding();
  onboarding.hidden = true;
  discover.hidden = false;
  document.querySelector("#profile-trigger").hidden = false;
  renderProfile();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderProfile() {
  const firstName = profile.name.split(/\s+/)[0];
  const initial = firstName.slice(0, 1).toUpperCase();
  document.querySelector("#header-avatar").textContent = initial;
  document.querySelector("#header-name").textContent = firstName;
  document.querySelector("#hero-city").textContent = `${profile.city}.`;
  document.querySelector("#profile-card-name").textContent = firstName;
  document.querySelector("#profile-card-city").textContent = profile.city;
  document.querySelector("#profile-card-goal").textContent = goalLabels[profile.socialGoal] || goalLabels.activity_partner;
  document.querySelector("#profile-initial").textContent = initial;
  document.querySelector("#profile-footnote").textContent = `${profile.availability?.[0] || "Flexible schedule"} · ${profile.skill === "any" ? "all levels" : profile.skill}`;
  const interests = profile.interests || [];
  document.querySelector("#profile-interest-list").innerHTML = interests.map((interest) => `<span class="profile-interest">${escapeHtml(interestIcons[interest] || "✦")} ${escapeHtml(interest)}</span>`).join("") || '<span class="profile-interest">Add an interest to get started</span>';
  renderSuggestions();
  promptInput.placeholder = `I’m in ${profile.city} and would love to ${profile.socialGoal === "activity_partner" ? "find one person to " : "meet a few people to "}${interests[0] || "try something new"} this weekend.`;
}

function renderSuggestions() {
  const interest = (profile.interests || ["coffee"])[0];
  const secondInterest = profile.interests?.[1] || interest;
  const defaultTime = profile.availability?.find((item) => item !== "Flexible") || "Saturday morning";
  const suggestions = [
    { label: `Find a ${interest} partner`, prompt: `I’m based in ${profile.city} and want one activity partner for ${interest} ${defaultTime.toLowerCase()}. Match my ${profile.skill === "any" ? "any" : profile.skill} level.` },
    { label: `Meet people over ${secondInterest}`, prompt: `I’m based in ${profile.city} and want a small group of compatible people to get together for ${secondInterest} ${defaultTime.toLowerCase()}.` },
    { label: "Surprise me with a plan", prompt: `I’m based in ${profile.city}. Suggest a realistic ${defaultTime.toLowerCase()} activity around ${interest}, and find people who are available.` },
  ];
  document.querySelector("#suggestion-chips").innerHTML = suggestions.map((item) => `<button class="suggestion-chip" type="button" data-prompt="${escapeHtml(item.prompt)}"><span>${escapeHtml(item.label)}</span><span aria-hidden="true">↗</span></button>`).join("");
}

function avatar(person, size = "") {
  const cls = ["person-avatar", person.color || "", size].filter(Boolean).join(" ");
  return `<span class="${cls}" aria-hidden="true">${escapeHtml(person.initials || person.name?.[0] || "?")}</span>`;
}

function renderNoMatches(plan) {
  const chips = (plan.alternatives || []).map((item) => `<span class="alternative-chip">${escapeHtml(item)}</span>`).join("");
  resultPanel.innerHTML = `
    <article class="plan-card no-match-card">
      <div class="plan-card-top"><span class="plan-type-pill muted-pill">NO MATCH YET</span><span class="plan-status status-open">No verified results</span></div>
      <div class="no-match-copy"><div class="no-match-icon">?</div><div><p class="plan-kicker">AN HONEST ANSWER</p><h3>No one to introduce you to <em>just yet.</em></h3><p class="plan-description">${escapeHtml(plan.message)}</p></div></div>
      <div class="alternatives">${chips}</div>
      <p class="sample-note"><span>✦</span> Linksy only shows matches from the available demo profiles and activities.</p>
    </article>`;
  resultLive.hidden = false;
}

function renderPeople(people) {
  return people.map((person) => {
    const inviteStatus = person.inviteStatus;
    const response = inviteStatus ? `<span class="invite-state ${inviteStatus === "accepted" ? "accepted" : "waiting"}"><i></i>${inviteStatus === "accepted" ? "Accepted" : "Waiting"}</span>` : `<span class="person-fit">GOOD FIT <span>✦</span></span>`;
    return `<article class="match-person">${avatar(person)}<div class="person-copy"><strong>${escapeHtml(person.name)}</strong><span>${escapeHtml(person.neighborhood)} · ${escapeHtml(person.skill)}</span></div>${response}</article>`;
  }).join("");
}

function renderPlan(plan) {
  activePlan = plan;
  if (plan.status === "no_matches") return renderNoMatches(plan);
  const approved = plan.status === "invitations_sent_demo";
  const declined = plan.status === "declined";
  const statusLabel = approved ? "Invites sent · demo" : declined ? "Plan declined" : "Waiting for your yes";
  const statusClass = approved ? "status-approved" : declined ? "status-declined" : "status-pending";
  const modelLabel = plan.aiMode === "openai" ? "GPT PERSONALIZED" : "SAMPLE AI MODE";
  const people = renderPeople(plan.people || []);
  const actionMarkup = !approved && !declined ? `
    <div class="plan-actions">
      <button class="primary-button approve-button" type="button" data-action="approve" data-plan-id="${escapeHtml(plan.id)}"><span>Approve &amp; send invites</span><span aria-hidden="true">↗</span></button>
      <button class="text-button decline-button" type="button" data-action="decline" data-plan-id="${escapeHtml(plan.id)}">Not this plan</button>
    </div>` : `<div class="resolved-banner ${approved ? "resolved-approved" : "resolved-declined"}"><span>${approved ? "✓" : "↶"}</span><div><strong>${approved ? "Your invitations are out" : "Nothing was sent"}</strong><span>${approved ? "Demo responses are shown below. No real messages were sent." : "You declined this plan. It will not be confirmed."}</span></div></div>`;
  resultPanel.innerHTML = `
    <article class="plan-card">
      <div class="plan-card-top"><span class="plan-type-pill">${escapeHtml(plan.kind || "A LINKSY PLAN")}</span><span class="plan-status ${statusClass}"><i></i>${statusLabel}</span></div>
      <div class="plan-intro"><p class="plan-kicker">A LITTLE SOMETHING FOR YOU</p><h3>${escapeHtml(plan.activity)} <em>in ${escapeHtml(plan.city)}</em></h3><p class="plan-description">${escapeHtml(plan.message)}</p></div>
      <div class="activity-details"><div class="detail-icon">✳</div><div class="activity-copy"><strong>${escapeHtml(plan.activityPlan?.name || plan.activity)}</strong><span>${escapeHtml(plan.activityPlan?.time || plan.time)}</span><span class="approx-location">⌖ ${escapeHtml(plan.activityPlan?.place || "Public meetup point")} <small>· approximate</small></span></div><span class="detail-arrow">↗</span></div>
      <div class="matches-heading"><div><p class="plan-kicker">YOUR POTENTIAL PEOPLE</p><span>${(plan.people || []).length} compatible ${(plan.people || []).length === 1 ? "person" : "people"}</span></div><span class="fit-tag">${modelLabel}</span></div>
      <div class="match-list">${people}</div>
      <p class="sample-note"><span>✦</span> ${escapeHtml(plan.note || "Sample profiles and availability for this demo. No invitations are sent until you approve.")}</p>
      ${approved ? '<div class="response-heading"><span>INVITE RESPONSES</span><span class="response-demo">DEMO STATUS</span></div>' : ""}
      ${actionMarkup}
      <p class="result-meta">PLAN ${escapeHtml(plan.id?.slice(0, 8) || "DEMO")} <span>·</span> ${escapeHtml(modelLabel)}</p>
    </article>`;
  resultLive.hidden = false;
}

async function requestPlan(prompt) {
  setBusy(true);
  setError("");
  resultPanel.innerHTML = '<div class="loading-state"><span class="loader-orbit"><i></i></span><div><p class="plan-kicker">PUTTING THE RIGHT PEOPLE TOGETHER</p><h3>Finding a plan<br />that feels like you.</h3><p>Checking demo people, activities, and timing.</p></div></div>';
  const matchingProfile = { city: profile.city, interests: profile.interests, socialGoal: profile.socialGoal, availability: profile.availability, skill: profile.skill };
  try {
    const response = await fetch("/api/plan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt, profile: matchingProfile }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Linksy couldn't make that plan.");
    renderPlan(result);
  } catch (error) {
    resultPanel.innerHTML = '<div class="empty-plan error-plan"><div class="empty-plan-icon">!</div><div><h3>Let’s try that again.</h3><p>Your request is still here. Give it another go in a moment.</p></div></div>';
    setError(error.message || "Something went wrong. Please try again.");
  } finally {
    setBusy(false);
  }
}

async function resolvePlan(action, id) {
  if (!id || !activePlan || activePlan.id !== id || activePlan.status !== "pending_approval") return;
  const target = document.querySelector(`[data-action="${action}"]`);
  if (target) target.disabled = true;
  try {
    const response = await fetch(`/api/plan/${encodeURIComponent(id)}/${action}`, { method: "POST" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "This plan could not be updated.");
    renderPlan(result);
  } catch (error) {
    setError(error.message || "This plan could not be updated.");
    if (target) target.disabled = false;
  }
}

document.querySelector("#continue-step").addEventListener("click", () => {
  if (currentStep === 1) {
    if (!document.querySelector("#profile-name").value.trim()) return setOnboardingError("Add your first name so we know what to call you.");
    if (!document.querySelector("#profile-city").value.trim()) return setOnboardingError("Add your city so Linksy can start with nearby people.");
  }
  if (currentStep === 2 && !document.querySelector('.interest-choice[aria-pressed="true"]')) return setOnboardingError("Choose at least one thing you enjoy.");
  setStep(currentStep + 1);
});

document.querySelector("#back-step").addEventListener("click", () => setStep(Math.max(1, currentStep - 1)));

document.querySelectorAll(".interest-choice, .availability-choice").forEach((choice) => {
  choice.addEventListener("click", () => {
    const pressed = choice.getAttribute("aria-pressed") === "true";
    choice.setAttribute("aria-pressed", String(!pressed));
    setOnboardingError("");
  });
});

onboardingForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const nextProfile = readProfileFields();
  if (!nextProfile.interests.length) return setOnboardingError("Choose at least one interest before continuing.");
  if (!nextProfile.availability.length) return setOnboardingError("Choose a time that usually works, or select “I’m flexible.”");
  profile = nextProfile;
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  } catch {
    setOnboardingError("This browser could not save your profile. Check your privacy settings and try again.");
    return;
  }
  activePlan = null;
  showDiscover();
});

document.querySelectorAll(".goal-option input").forEach((input) => input.addEventListener("change", () => setOnboardingError("")));
document.querySelector("#edit-profile").addEventListener("click", () => showOnboarding(true));
document.querySelector("#profile-trigger").addEventListener("click", () => showOnboarding(true));

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const prompt = promptInput.value.trim();
  if (!prompt) return setError("Tell Linksy what you’d like to do first.");
  requestPlan(prompt);
});

document.querySelector("#suggestion-chips").addEventListener("click", (event) => {
  const chip = event.target.closest("[data-prompt]");
  if (!chip) return;
  promptInput.value = chip.dataset.prompt || "";
  form.requestSubmit();
});

resultPanel.addEventListener("click", (event) => {
  const action = event.target.closest("[data-action]");
  if (action) resolvePlan(action.dataset.action, action.dataset.planId);
});

fetch("/api/health").then((response) => response.json()).then((health) => {
  demoBadge.innerHTML = `<span class="status-dot"></span> ${health.aiMode === "openai" ? "GPT connected" : "Demo profiles"}`;
  if (health.aiMode === "openai") demoBadge.classList.add("ai-connected");
}).catch(() => {});

if (profile) showDiscover();
else showOnboarding();
