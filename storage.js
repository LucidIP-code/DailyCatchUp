const fs = require("fs");
const path = require("path");
const { Redis } = require("@upstash/redis");

const LOCAL_DATA_FILE = path.join(__dirname, "data.json");
const REDIS_PREFIX = "dailycatchup";
const REDIS_INITIALIZED_KEY = `${REDIS_PREFIX}:options:initialized`;
const REDIS_NAMES_KEY = `${REDIS_PREFIX}:options:names`;
const REDIS_PROJECTS_KEY = `${REDIS_PREFIX}:options:projects`;

// Exact variable names provided by the connected Vercel Upstash integration.
const redisUrl =
  process.env.UPSTASH_REDIS_REST_KV_REST_API_URL ||
  process.env.UPSTASH_REDIS_REST_URL;
const redisToken =
  process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN ||
  process.env.UPSTASH_REDIS_REST_TOKEN;
const redis = redisUrl && redisToken ? new Redis({ url: redisUrl, token: redisToken }) : null;

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

function sortOptions(data) {
  return {
    names: [...new Set(data.names || [])].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })),
    projects: [...new Set(data.projects || [])].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })),
  };
}

async function ensureRedisInitialized() {
  if (!redis) return;
  const initialized = await redis.setnx(REDIS_INITIALIZED_KEY, "1");
  if (initialized === 1) {
    const seed = readLocalData();
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

function requireRedis() {
  if (!redis) throw new Error("Persistent Redis storage is not configured on this deployment.");
}

async function addOption(type, value) {
  const normalized = String(value || "").trim();
  if (!normalized) return getOptions();
  requireRedis();
  await ensureRedisInitialized();
  await redis.sadd(type === "name" ? REDIS_NAMES_KEY : REDIS_PROJECTS_KEY, normalized);
  return getOptions();
}

async function deleteOption(type, value) {
  const normalized = String(value || "").trim();
  requireRedis();
  await ensureRedisInitialized();
  await redis.srem(type === "name" ? REDIS_NAMES_KEY : REDIS_PROJECTS_KEY, normalized);
  return getOptions();
}

module.exports = { getOptions, addOption, deleteOption, isRedisConfigured: Boolean(redis) };
