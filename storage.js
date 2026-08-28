const fs = require("fs");
const path = require("path");
const { Redis } = require("@upstash/redis");

const LOCAL_DATA_FILE = path.join(__dirname, "data.json");
const REDIS_PREFIX = "dailycatchup";
const REDIS_INITIALIZED_KEY = `${REDIS_PREFIX}:options:initialized`;
const REDIS_NAMES_KEY = `${REDIS_PREFIX}:options:names`;
const REDIS_PROJECTS_KEY = `${REDIS_PREFIX}:options:projects`;

// Vercel integrations can expose either the standard REST variable names or
// the generated KV-prefixed names, so support both without exposing secrets.
const redisUrl =
  process.env.UPSTASH_REDIS_REST_URL ||
  process.env.UPSTASH_REDIS_REST_KV_REST_URL;
const redisToken =
  process.env.UPSTASH_REDIS_REST_TOKEN ||
  process.env.UPSTASH_REDIS_REST_KV_REST_TOKEN ||
  process.env.UPSTASH_REDIS_REST_KV_API_TOKEN;

const redis = redisUrl && redisToken
  ? new Redis({ url: redisUrl, token: redisToken })
  : null;

function readLocalData() {
  try {
    const parsed = JSON.parse(fs.readFileSync(LOCAL_DATA_FILE, "utf8"));
    return {
      names: Array.isArray(parsed.names) ? parsed.names : [],
      projects: Array.isArray(parsed.projects) ? parsed.projects : [],
    };
  } catch {
    return { names: [], projects: [] };
  }
}

function writeLocalData(data) {
  fs.writeFileSync(LOCAL_DATA_FILE, JSON.stringify(sortOptions(data), null, 2));
}

function sortOptions(data) {
  return {
    names: [...new Set(data.names || [])].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })),
    projects: [...new Set(data.projects || [])].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })),
  };
}

async function ensureRedisInitialized() {
  if (!redis) return;

  const seed = readLocalData();
  // Seed only once. Sets make this safe even if two instances initialize together.
  const initialized = await redis.setnx(REDIS_INITIALIZED_KEY, "1");
  if (initialized === 1) {
    if (seed.names.length) await redis.sadd(REDIS_NAMES_KEY, ...seed.names);
    if (seed.projects.length) await redis.sadd(REDIS_PROJECTS_KEY, ...seed.projects);
  }
}

async function getOptions() {
  if (!redis) return sortOptions(readLocalData());
  await ensureRedisInitialized();
  const [names, projects] = await Promise.all([
    redis.smembers(REDIS_NAMES_KEY),
    redis.smembers(REDIS_PROJECTS_KEY),
  ]);
  return sortOptions({ names: names || [], projects: projects || [] });
}

async function addOption(type, value) {
  const normalized = String(value || "").trim();
  if (!normalized) return getOptions();

  if (!redis) {
    const data = readLocalData();
    const key = type === "name" ? "names" : "projects";
    if (!data[key].includes(normalized)) data[key].push(normalized);
    writeLocalData(data);
    return sortOptions(data);
  }

  await ensureRedisInitialized();
  await redis.sadd(type === "name" ? REDIS_NAMES_KEY : REDIS_PROJECTS_KEY, normalized);
  return getOptions();
}

async function deleteOption(type, value) {
  const normalized = String(value || "").trim();
  if (!redis) {
    const data = readLocalData();
    const key = type === "name" ? "names" : "projects";
    data[key] = data[key].filter((item) => item !== normalized);
    writeLocalData(data);
    return sortOptions(data);
  }

  await ensureRedisInitialized();
  await redis.srem(type === "name" ? REDIS_NAMES_KEY : REDIS_PROJECTS_KEY, normalized);
  return getOptions();
}

module.exports = { getOptions, addOption, deleteOption, isRedisConfigured: Boolean(redis) };
