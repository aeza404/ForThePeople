const form = document.querySelector("#plan-form");
const promptInput = document.querySelector("#prompt");
const resultPanel = document.querySelector("#result-panel");
const errorNode = document.querySelector("#form-error");
const button = document.querySelector("#find-button");
const resultLive = document.querySelector("#result-live");
const demoBadge = document.querySelector(".demo-badge");
let activePlan = null;

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function setBusy(busy) {
  resultPanel.setAttribute("aria-busy", String(busy));
  button.disabled = busy;
  button.innerHTML = busy ? '<span class="button-spinner"></span><span>Finding your people</span>' : '<span>Find my people</span><span class="button-arrow" aria-hidden="true">↗</span>';
}

function setError(message = "") {
  errorNode.textContent = message;
  errorNode.hidden = !message;
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
      <div class="no-match-illustration" aria-hidden="true"><span>?</span><i></i><i></i><i></i></div>
      <p class="plan-kicker">HONEST ANSWER</p>
      <h2>No one to introduce<br />you to <em>just yet.</em></h2>
      <p class="plan-description">${escapeHtml(plan.message)}</p>
      <div class="alternatives">${chips}</div>
      <p class="sample-note"><span>✦</span> Linksy only shows matches from the available demo profiles and activities.</p>
    </article>`;
  resultLive.hidden = false;
}

function renderPeople(people, status) {
  return people.map((person) => {
    const inviteStatus = person.inviteStatus;
    const response = inviteStatus ? `<span class="invite-state ${inviteStatus === "accepted" ? "accepted" : "waiting"}"><i></i>${inviteStatus === "accepted" ? "Accepted" : "Waiting"}</span>` : `<span class="person-fit">GOOD FIT <span>✦</span></span>`;
    return `<article class="match-person">
      ${avatar(person)}
      <div class="person-copy"><strong>${escapeHtml(person.name)}</strong><span>${escapeHtml(person.neighborhood)} · ${escapeHtml(person.skill)}</span></div>
      ${response}
    </article>`;
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
  const people = renderPeople(plan.people || [], plan.status);
  const actionMarkup = !approved && !declined ? `
    <div class="plan-actions">
      <button class="primary-button approve-button" type="button" data-action="approve" data-plan-id="${escapeHtml(plan.id)}"><span>Approve &amp; send invites</span><span class="button-arrow" aria-hidden="true">↗</span></button>
      <button class="text-button decline-button" type="button" data-action="decline" data-plan-id="${escapeHtml(plan.id)}">Not this plan</button>
    </div>` : `<div class="resolved-banner ${approved ? "resolved-approved" : "resolved-declined"}"><span>${approved ? "✓" : "↶"}</span><div><strong>${approved ? "Your invitations are out" : "Nothing was sent"}</strong><span>${approved ? "Demo responses are shown below. No real messages were sent." : "You declined this plan. It will not be confirmed."}</span></div></div>`;
  resultPanel.innerHTML = `
    <article class="plan-card">
      <div class="plan-card-top"><span class="plan-type-pill">${escapeHtml(plan.kind || "A LINKSY PLAN")}</span><span class="plan-status ${statusClass}"><i></i>${statusLabel}</span></div>
      <div class="plan-intro"><p class="plan-kicker">A LITTLE SOMETHING FOR YOU</p><h2>${escapeHtml(plan.activity)}<br /><em>${escapeHtml(plan.city)}</em></h2><p class="plan-description">${escapeHtml(plan.message)}</p></div>
      <div class="activity-details"><div class="detail-icon">✳</div><div class="activity-copy"><strong>${escapeHtml(plan.activityPlan?.name || plan.activity)}</strong><span>${escapeHtml(plan.activityPlan?.time || plan.time)}</span><span class="approx-location">⌖ ${escapeHtml(plan.activityPlan?.place || "Public meetup point")} <small>· approximate</small></span></div><span class="detail-arrow">↗</span></div>
      <div class="matches-heading"><div><p class="plan-kicker">YOUR POTENTIAL PEOPLE</p><span>${(plan.people || []).length} compatible ${(plan.people || []).length === 1 ? "person" : "people"}</span></div><span class="fit-tag">${modelLabel}</span></div>
      <div class="match-list">${people}</div>
      <p class="sample-note"><span>✦</span> ${escapeHtml(plan.note || "Sample profiles and availability for this demo. No invitations are sent until you approve.")}</p>
      ${approved ? `<div class="response-heading"><span>INVITE RESPONSES</span><span class="response-demo">DEMO STATUS</span></div>` : ""}
      ${actionMarkup}
      <p class="result-meta">PLAN ${escapeHtml(plan.id?.slice(0, 8) || "DEMO")} <span>·</span> ${escapeHtml(modelLabel)}</p>
    </article>`;
}

async function requestPlan(prompt) {
  setBusy(true);
  setError("");
  resultPanel.innerHTML = '<div class="loading-state"><span class="loader-orbit"><i></i></span><p class="empty-eyebrow">PUTTING THE RIGHT PEOPLE TOGETHER</p><h2>Finding a plan<br />that feels like you.</h2><p>Checking the demo people, activities, and timing.</p></div>';
  try {
    const response = await fetch("/api/plan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Linksy couldn't make that plan.");
    renderPlan(result);
    resultLive.hidden = false;
  } catch (error) {
    resultPanel.innerHTML = '<div class="empty-state compact-empty"><div class="soft-error-mark">!</div><h2>Let’s try that again.</h2><p class="empty-copy">Your request is still here. Give it another go in a moment.</p></div>';
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

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const prompt = promptInput.value.trim();
  if (!prompt) return setError("Tell Linksy what you’d like to do first.");
  requestPlan(prompt);
});

document.querySelectorAll(".scenario-chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    promptInput.value = chip.dataset.prompt || "";
    promptInput.focus();
    form.requestSubmit();
  });
});

resultPanel.addEventListener("click", (event) => {
  const action = event.target.closest("[data-action]");
  if (action) resolvePlan(action.dataset.action, action.dataset.planId);
});

fetch("/api/health").then((response) => response.json()).then((health) => {
  demoBadge.innerHTML = `<span class="status-dot"></span> ${health.aiMode === "openai" ? "GPT connected" : "Demo mode"}`;
  if (health.aiMode === "openai") demoBadge.classList.add("ai-connected");
}).catch(() => {});
