const fs = require("fs");
const path = require("path");
const { Redis } = require("@upstash/redis");

const LOCAL_DATA_FILE = path.join(__dirname, "data.json");
const REDIS_PREFIX = "dailycatchup";
const REDIS_INITIALIZED_KEY = `${REDIS_PREFIX}:options:initialized`;
const REDIS_NAMES_KEY = `${REDIS_PREFIX}:options:names`;
const REDIS_PROJECTS_KEY = `${REDIS_PREFIX}:options:projects`;
const REDIS_PEOPLE_KEY = `${REDIS_PREFIX}:people`;

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

function sortValues(values) {
  return [...new Set(values || [])].sort((a, b) =>
    String(a).localeCompare(String(b), undefined, { sensitivity: "base" })
  );
}

function sortOptions(data) {
  return {
    names: sortValues(data.names),
    projects: sortValues(data.projects),
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

function requireRedis() {
  if (!redis) throw new Error("Persistent Redis storage is not configured on this deployment.");
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
  if (type === "name") await redis.hdel(REDIS_PEOPLE_KEY, normalized);
  return getOptions();
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function validatePerson(name, email) {
  const cleanName = String(name || "").trim();
  const cleanEmail = normalizeEmail(email);
  if (!cleanName) throw new Error("Name is required.");
  if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) throw new Error("A valid email address is required.");
  return { name: cleanName, email: cleanEmail };
}

async function getPeople() {
  if (!redis) {
    return (await getOptions()).names.map((name) => ({ name, email: "" }));
  }
  await ensureRedisInitialized();
  const [names, emails] = await Promise.all([
    redis.smembers(REDIS_NAMES_KEY),
    redis.hgetall(REDIS_PEOPLE_KEY),
  ]);
  return sortValues(names || []).map((name) => ({
    name,
    email: emails && emails[name] ? String(emails[name]) : "",
  }));
}

async function upsertPerson(name, email) {
  const person = validatePerson(name, email);
  requireRedis();
  await ensureRedisInitialized();
  await Promise.all([
    redis.sadd(REDIS_NAMES_KEY, person.name),
    redis.hset(REDIS_PEOPLE_KEY, { [person.name]: person.email }),
  ]);
  return getPeople();
}

async function deletePerson(name) {
  const cleanName = String(name || "").trim();
  if (!cleanName) throw new Error("Name is required.");
  requireRedis();
  await ensureRedisInitialized();
  await Promise.all([
    redis.srem(REDIS_NAMES_KEY, cleanName),
    redis.hdel(REDIS_PEOPLE_KEY, cleanName),
  ]);
  return getPeople();
}

module.exports = {
  getOptions,
  addOption,
  deleteOption,
  getPeople,
  upsertPerson,
  deletePerson,
  isRedisConfigured: Boolean(redis),
};
