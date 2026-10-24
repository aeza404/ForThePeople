import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const publicRoot = resolve(root, "public");
const port = Number(process.env.PORT || 4173);
const model = process.env.OPENAI_MODEL || "gpt-6-astra";
const plans = new Map();

const people = [
  { id: "jordan", name: "Jordan", initials: "J", city: "Oakland", neighborhood: "near Lake Merritt", interests: ["pickleball", "coffee"], skill: "intermediate", availability: ["Saturday morning"], welcomesVisitors: true, color: "sage" },
  { id: "maya", name: "Maya", initials: "M", city: "Chicago", neighborhood: "Wicker Park", interests: ["coffee", "food", "live music"], skill: "all levels", availability: ["Friday evening", "Saturday morning", "Saturday afternoon"], welcomesVisitors: true, color: "rose" },
  { id: "leo", name: "Leo", initials: "L", city: "Chicago", neighborhood: "Logan Square", interests: ["coffee", "food", "photography"], skill: "all levels", availability: ["Saturday morning", "Saturday afternoon", "Sunday afternoon"], welcomesVisitors: true, color: "blue" },
  { id: "nina", name: "Nina", initials: "N", city: "Oakland", neighborhood: "near Temescal", interests: ["hiking", "outdoors"], skill: "intermediate", availability: ["Saturday morning", "Sunday morning"], welcomesVisitors: false, color: "gold" },
  { id: "alex", name: "Alex", initials: "A", city: "Oakland", neighborhood: "near the hills", interests: ["hiking", "photography"], skill: "beginner", availability: ["Saturday morning"], welcomesVisitors: true, color: "lilac" },
  { id: "cam", name: "Cam", initials: "C", city: "Oakland", neighborhood: "near Grand Lake", interests: ["hiking", "food"], skill: "intermediate", availability: ["Saturday morning"], welcomesVisitors: true, color: "mint" },
];

const activities = [
  { id: "oakland-pickleball", name: "Saturday pickleball", city: "Oakland", time: "Saturday · 10:00 AM", place: "Public courts near Lake Merritt", interests: ["pickleball"], group: false },
  { id: "oakland-hike", name: "Redwood Regional trail walk", city: "Oakland", time: "Saturday · 9:30 AM", place: "Redwood Regional Park entrance", interests: ["hiking", "outdoors"], group: true },
  { id: "chicago-coffee", name: "Neighborhood coffee crawl", city: "Chicago", time: "Saturday · 10:30 AM", place: "Wicker Park meetup point", interests: ["coffee", "food"], group: true },
  { id: "chicago-food", name: "West Loop food walk", city: "Chicago", time: "Saturday · 1:00 PM", place: "West Loop public plaza", interests: ["food", "restaurants"], group: true },
  { id: "chicago-music", name: "Small-venue live music", city: "Chicago", time: "Friday · 7:30 PM", place: "Logan Square meetup point", interests: ["music", "nightlife"], group: true },
];

const sendJson = (res, status, data) => {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(data));
};

async function readJson(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 16_000) throw new Error("Request is too large.");
  }
  return JSON.parse(raw || "{}");
}

function normalizeProfile(profile = {}) {
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) return {};
  const text = (value, max = 100) => typeof value === "string" ? value.trim().slice(0, max) : "";
  return {
    city: text(profile.city, 80),
    interests: Array.isArray(profile.interests) ? profile.interests.filter((value) => typeof value === "string").map((value) => text(value, 40)).filter(Boolean).slice(0, 12) : [],
    socialGoal: text(profile.socialGoal, 40),
    availability: Array.isArray(profile.availability) ? profile.availability.filter((value) => typeof value === "string").map((value) => text(value, 40)).filter(Boolean).slice(0, 7) : [],
    skill: ["beginner", "intermediate", "advanced", "any"].includes(profile.skill) ? profile.skill : "any",
  };
}

function fallbackIntent(prompt, profile = {}) {
  const text = prompt.toLowerCase();
  const interests = Array.isArray(profile.interests) ? profile.interests : [];
  const availability = Array.isArray(profile.availability) ? profile.availability : [];
  const knownCity = ["Chicago", "Oakland"].find((cityName) => text.includes(cityName.toLowerCase()));
  const requestedCity = prompt.match(/\b(?:in|to|visiting|visit)\s+([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,2})\b/);
  const city = knownCity || requestedCity?.[1] || profile.city || "Oakland";
  const supportedActivities = ["pickleball", "hiking", "coffee", "food", "restaurant", "music", "nightlife", "networking"];
  const activity = supportedActivities.find((word) => text.includes(word))
    || interests.find((interest) => supportedActivities.includes(interest.toLowerCase()))
    || "";
  const time = /friday|tonight/.test(text) ? "Friday evening"
    : /sunday afternoon/.test(text) ? "Sunday afternoon"
      : /sunday/.test(text) ? "Sunday morning"
        : /saturday afternoon|saturday after/.test(text) ? "Saturday afternoon"
          : /saturday/.test(text) ? "Saturday morning"
          : availability.find((window) => ["Saturday morning", "Saturday afternoon", "Sunday morning", "Friday evening"].includes(window)) || "Saturday morning";
  const skill = ["beginner", "intermediate", "advanced"].find((word) => text.includes(word)) || profile.skill || "any";
  const asksOnePerson = /one[- ]on[- ]one|one person|one activity partner|a partner|an activity partner/.test(text);
  const asksGroup = /small group|group|meet a few people|a few people|with others|join people/.test(text);
  return {
    city,
    activity: activity === "restaurant" ? "food" : activity,
    time,
    skill,
    visiting: /visit|visiting|travel|weekend in/.test(text),
    group: asksGroup ? true : asksOnePerson ? false : ["join_groups", "meet_friends"].includes(profile.socialGoal),
  };
}

function timeParts(value = "") {
  const text = value.toLowerCase();
  const day = ["friday", "saturday", "sunday", "monday", "tuesday", "wednesday", "thursday"].find((item) => text.includes(item))
    || (text.includes("weekend") ? "weekend" : "");
  const clock = text.match(/\b(\d{1,2})(?::\d{2})?\s*(am|pm)\b/);
  const hour = clock ? Number(clock[1]) % 12 + (clock[2] === "pm" ? 12 : 0) : null;
  const period = hour !== null ? (hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening")
    : /evening|tonight|night/.test(text) ? "evening"
      : /afternoon|noon/.test(text) ? "afternoon"
        : /morning/.test(text) ? "morning" : "";
  return { day, period };
}

function timeMatches(availableWindow, requestedTime) {
  const available = timeParts(availableWindow);
  const requested = timeParts(requestedTime);
  if (available.day && requested.day && available.day !== requested.day
    && !(available.day === "weekend" && ["saturday", "sunday", "weekend"].includes(requested.day))
    && !(requested.day === "weekend" && ["saturday", "sunday", "weekend"].includes(available.day))) return false;
  if (available.period && requested.period && available.period !== requested.period) return false;
  if (requested.day && !available.day && !availableWindow.toLowerCase().includes("weekday")) return false;
  if (requested.period && !available.period) return false;
  return true;
}

function parseModelText(body) {
  const chunks = [];
  for (const item of body.output || []) {
    if (item.type !== "message") continue;
    for (const content of item.content || []) if (content.type === "output_text" && content.text) chunks.push(content.text);
  }
  const text = chunks.join("\n").trim();
  if (!text) throw new Error("The model returned no text.");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("The model did not return the expected intent fields.");
  return JSON.parse(text.slice(start, end + 1));
}

async function interpret(prompt, profile = {}) {
  const fallback = fallbackIntent(prompt, profile);
  if (!process.env.OPENAI_API_KEY) return { intent: fallback, aiMode: "sample" };
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      model,
      instructions: "Extract a Linksy activity request into JSON only with keys city, activity, time, skill, visiting, and group. The user's profile is context for defaults when the request omits a city, interest, schedule, or group preference; explicit request details always take priority. Do not invent people, events, availability, locations, matches, or invitations. city is a city name, activity is a short activity category, time is a short time window, skill is beginner/intermediate/advanced/any, visiting and group are booleans.",
      input: JSON.stringify({ request: prompt, profile }),
    }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`OpenAI request failed (${response.status}).`);
  const body = await response.json();
  const extracted = parseModelText(body);
  return {
    intent: {
      city: typeof extracted.city === "string" && extracted.city.trim() ? extracted.city.trim() : fallback.city,
      activity: typeof extracted.activity === "string" ? extracted.activity.toLowerCase().trim() : fallback.activity,
      time: typeof extracted.time === "string" && extracted.time.trim() ? extracted.time.trim() : fallback.time,
      skill: ["beginner", "intermediate", "advanced", "any"].includes(String(extracted.skill).toLowerCase()) ? String(extracted.skill).toLowerCase() : fallback.skill,
      visiting: typeof extracted.visiting === "boolean" ? extracted.visiting : fallback.visiting,
      group: typeof extracted.group === "boolean" ? extracted.group : fallback.group,
    },
    aiMode: "openai",
  };
}

function buildPlan(intent) {
  const activityText = intent.activity.toLowerCase();
  const targetActivities = activities.filter((item) => item.city.toLowerCase() === intent.city.toLowerCase()
    && timeMatches(item.time, intent.time)
    && (item.interests.some((interest) => activityText.includes(interest) || interest.includes(activityText)) || activityText === ""));
  const compatible = people.filter((person) => person.city.toLowerCase() === intent.city.toLowerCase()
    && (!intent.visiting || person.welcomesVisitors)
    && person.availability.some((window) => timeMatches(window, intent.time))
    && (activityText === "" || person.interests.some((interest) => activityText.includes(interest) || interest.includes(activityText)))
    && (intent.skill === "any" || intent.skill === "" || intent.skill === "all levels" || person.skill === intent.skill || person.skill === "all levels"));

  if (!targetActivities.length || !compatible.length) {
    return {
      status: "no_matches",
      city: intent.city,
      activity: intent.activity || "that activity",
      time: intent.time,
      people: [],
      activityPlan: null,
      message: `I couldn’t find a verified ${intent.activity || "activity"} match in ${intent.city} for ${intent.time}. I won’t make one up. Try a nearby time or a different interest.`,
      alternatives: ["Try another time window", "Explore coffee or hiking", "Widen the city area"],
    };
  }

  const selectedActivity = targetActivities.find((item) => item.group === intent.group) || targetActivities[0];
  const selectedPeople = intent.group ? compatible.slice(0, 3) : compatible.slice(0, 1);
  const group = intent.group;
  return {
    status: "pending_approval",
    city: intent.city,
    activity: selectedActivity.name,
    time: selectedActivity.time,
    people: selectedPeople,
    activityPlan: selectedActivity,
    kind: group ? "Group plan" : "One-on-one match",
    message: intent.visiting
      ? `Here’s a sample plan for your ${intent.city} visit. These local members opted in to meeting visitors.`
      : `Here’s a sample ${intent.city} plan built around ${intent.activity || "your interests"} and ${intent.time}.`,
    note: "Sample profiles and availability for this demo. No invitations are sent until you approve.",
  };
}

async function handleApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/health") {
    return sendJson(res, 200, { ok: true, aiMode: process.env.OPENAI_API_KEY ? "openai" : "sample", model: process.env.OPENAI_API_KEY ? model : null });
  }
  if (req.method === "POST" && url.pathname === "/api/plan") {
    try {
      const { prompt, profile: rawProfile } = await readJson(req);
      if (typeof prompt !== "string" || !prompt.trim()) return sendJson(res, 400, { error: "Tell Linksy what you would like to do." });
      const profile = normalizeProfile(rawProfile);
      let result;
      try {
        const { intent, aiMode } = await interpret(prompt.slice(0, 2000), profile);
        result = { ...buildPlan(intent), aiMode, intent };
      } catch (error) {
        result = { ...buildPlan(fallbackIntent(prompt, profile)), aiMode: "sample_fallback", intent: fallbackIntent(prompt, profile), warning: "The GPT connection was unavailable, so Linksy used its demo interpreter." };
      }
      const id = randomUUID();
      const plan = { id, ...result, createdAt: new Date().toISOString() };
      plans.set(id, plan);
      return sendJson(res, 200, plan);
    } catch (error) {
      return sendJson(res, 400, { error: error.message || "Could not read the request." });
    }
  }
  const action = url.pathname.match(/^\/api\/plan\/([a-f0-9-]+)\/(approve|decline)$/i);
  if (req.method === "POST" && action) {
    const current = plans.get(action[1]);
    if (!current) return sendJson(res, 404, { error: "This demo plan is no longer available. Create it again." });
    if (current.status !== "pending_approval") return sendJson(res, 409, { error: "This plan has already been resolved." });
    if (action[2] === "decline") current.status = "declined";
    else {
      current.status = "invitations_sent_demo";
      current.people = current.people.map((person, index) => ({ ...person, inviteStatus: index === 0 ? "accepted" : "waiting" }));
    }
    plans.set(current.id, current);
    return sendJson(res, 200, current);
  }
  return sendJson(res, 404, { error: "Not found." });
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  if (url.pathname.startsWith("/api/")) return handleApi(req, res, url);
  const requested = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const file = resolve(publicRoot, `.${requested}`);
  if (!file.startsWith(publicRoot + sep) && file !== resolve(publicRoot, "index.html")) {
    res.writeHead(403); return res.end("Forbidden");
  }
  try {
    const content = await readFile(file);
    const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml" };
    res.writeHead(200, { "content-type": types[extname(file)] || "application/octet-stream", "cache-control": "no-store" });
    res.end(content);
  } catch {
    res.writeHead(404); res.end("Not found");
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`Linksy is running at http://localhost:${port}`);
  console.log(`AI mode: ${process.env.OPENAI_API_KEY ? `OpenAI Responses API (${model})` : "sample demo (set OPENAI_API_KEY to enable the GPT model)"}`);
});
