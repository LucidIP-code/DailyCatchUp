const fs = require("fs");
const path = require("path");
const { Redis } = require("@upstash/redis");

const LOCAL_DATA_FILE = path.join(__dirname, "data.json");
const REDIS_PREFIX = "dailycatchup";
const REDIS_INITIALIZED_KEY = `${REDIS_PREFIX}:options:initialized`;
const REDIS_NAMES_KEY = `${REDIS_PREFIX}:options:names`;
const REDIS_PROJECTS_KEY = `${REDIS_PREFIX}:options:projects`;
const REDIS_PEOPLE_KEY = `${REDIS_PREFIX}:people`;

const redisUrl = process.env.UPSTASH_REDIS_REST_KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const redis = redisUrl && redisToken ? new Redis({ url: redisUrl, token: redisToken }) : null;

function readLocalData() {
  try {
    const parsed = JSON.parse(fs.readFileSync(LOCAL_DATA_FILE, "utf8"));
    return { names: Array.isArray(parsed.names) ? parsed.names : [], projects: Array.isArray(parsed.projects) ? parsed.projects : [] };
  } catch { return { names: [], projects: [] }; }
}
function sortValues(values) { return [...new Set(values || [])].sort((a,b)=>String(a).localeCompare(String(b),undefined,{sensitivity:"base"})); }
function sortOptions(data) { return { names: sortValues(data.names), projects: sortValues(data.projects) }; }
async function ensureRedisInitialized() {
  if (!redis) return;
  const initialized = await redis.setnx(REDIS_INITIALIZED_KEY, "1");
  if (initialized === 1) {
    const seed = readLocalData();
    if (seed.names.length) await redis.sadd(REDIS_NAMES_KEY, ...seed.names);
    if (seed.projects.length) await redis.sadd(REDIS_PROJECTS_KEY, ...seed.projects);
  }
}
function requireRedis() { if (!redis) throw new Error("Persistent Redis storage is not configured on this deployment."); }
async function getOptions() {
  if (!redis) return sortOptions(readLocalData());
  await ensureRedisInitialized();
  const [names, projects] = await Promise.all([redis.smembers(REDIS_NAMES_KEY), redis.smembers(REDIS_PROJECTS_KEY)]);
  return sortOptions({ names: names || [], projects: projects || [] });
}
async function addOption(type,value) { const normalized=String(value||"").trim(); if(!normalized)return getOptions(); requireRedis(); await ensureRedisInitialized(); await redis.sadd(type==="name"?REDIS_NAMES_KEY:REDIS_PROJECTS_KEY,normalized); return getOptions(); }
async function deleteOption(type,value) { const normalized=String(value||"").trim(); requireRedis(); await ensureRedisInitialized(); await redis.srem(type==="name"?REDIS_NAMES_KEY:REDIS_PROJECTS_KEY,normalized); if(type==="name")await redis.hdel(REDIS_PEOPLE_KEY,normalized); return getOptions(); }
function normalizeEmail(email){return String(email||"").trim().toLowerCase();}
function validatePerson(name,email){const cleanName=String(name||"").trim();const cleanEmail=normalizeEmail(email);if(!cleanName)throw new Error("Name is required.");if(!/^\S+@\S+\.\S+$/.test(cleanEmail))throw new Error("A valid email address is required.");return{name:cleanName,email:cleanEmail};}
async function getPeople(){if(!redis)return(await getOptions()).names.map(name=>({name,email:""}));await ensureRedisInitialized();const[names,emails]=await Promise.all([redis.smembers(REDIS_NAMES_KEY),redis.hgetall(REDIS_PEOPLE_KEY)]);return sortValues(names||[]).map(name=>({name,email:emails&&emails[name]?String(emails[name]):""}));}
async function upsertPerson(name,email){const person=validatePerson(name,email);requireRedis();await ensureRedisInitialized();await Promise.all([redis.sadd(REDIS_NAMES_KEY,person.name),redis.hset(REDIS_PEOPLE_KEY,{[person.name]:person.email})]);return getPeople();}
async function deletePerson(name){const cleanName=String(name||"").trim();if(!cleanName)throw new Error("Name is required.");requireRedis();await ensureRedisInitialized();await Promise.all([redis.srem(REDIS_NAMES_KEY,cleanName),redis.hdel(REDIS_PEOPLE_KEY,cleanName)]);return getPeople();}

function holidayKey(year) { return `${REDIS_PREFIX}:holidays:${year}`; }
function validateYear(year) { const y=String(year||"").trim(); if(!/^\d{4}$/.test(y)) throw new Error("A valid 4-digit year is required."); return y; }
function validateDate(date, year) { const d=String(date||"").trim(); const y=validateYear(year); if(!/^\d{4}-\d{2}-\d{2}$/.test(d)||d.slice(0,4)!==y) throw new Error("Holiday date must be YYYY-MM-DD and match the selected year."); const parsed=new Date(`${d}T00:00:00Z`); if(Number.isNaN(parsed.getTime())||parsed.toISOString().slice(0,10)!==d) throw new Error("Invalid holiday date."); return d; }
function normalizeHoliday(raw, fieldDate) {
  if (raw == null && !fieldDate) return null;
  if (typeof raw === "object" && raw !== null) {
    const date = String(raw.date || fieldDate || "").trim();
    const name = String(raw.name || raw.title || "").trim();
    return date && name ? { date, name } : null;
  }
  if (fieldDate) {
    const value = String(raw || "").trim();
    if (!value) return null;
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object") return normalizeHoliday(parsed, fieldDate);
    } catch {}
    return { date: String(fieldDate), name: value };
  }
  return null;
}
function normalizeHolidayCollection(value) {
  if (value == null) return [];
  let parsed = value;
  if (typeof value === "string") {
    try { parsed = JSON.parse(value); } catch { return []; }
  }
  if (Array.isArray(parsed)) return parsed.map(v=>normalizeHoliday(v)).filter(Boolean);
  if (parsed && typeof parsed === "object") {
    if (Array.isArray(parsed.holidays)) return parsed.holidays.map(v=>normalizeHoliday(v)).filter(Boolean);
    return Object.entries(parsed).map(([date,name])=>normalizeHoliday(name,date)).filter(Boolean);
  }
  return [];
}
async function getHolidays(year){
  requireRedis();
  const y=validateYear(year);
  await ensureRedisInitialized();
  const key=holidayKey(y);
  const keyType=String(await redis.type(key) || "none").toLowerCase();
  let holidays=[];
  if(keyType==="none") return [];
  if(keyType==="hash") {
    const hash=await redis.hgetall(key);
    holidays=Object.entries(hash||{}).map(([date,value])=>normalizeHoliday(value,date)).filter(Boolean);
  } else if(keyType==="set") {
    const values=await redis.smembers(key);
    holidays=(values||[]).map(v=>{try{return normalizeHoliday(JSON.parse(v));}catch{return null;}}).filter(Boolean);
  } else if(keyType==="string") {
    holidays=normalizeHolidayCollection(await redis.get(key));
  } else if(keyType==="json") {
    holidays=normalizeHolidayCollection(await redis.json.get(key));
  } else {
    throw new Error(`Unsupported Redis type for ${key}: ${keyType}`);
  }
  return holidays.sort((a,b)=>a.date.localeCompare(b.date));
}
async function addHoliday(year,date,name){
  requireRedis();
  const y=validateYear(year);
  const d=validateDate(date,y);
  const n=String(name||"").trim();
  if(!n)throw new Error("Holiday name is required.");
  await ensureRedisInitialized();
  const key=holidayKey(y);
  const keyType=String(await redis.type(key) || "none").toLowerCase();
  if(keyType==="none" || keyType==="hash") {
    await redis.hset(key,{[d]:n});
  } else {
    const existing=await getHolidays(y);
    await redis.del(key);
    const fields={};
    for(const h of existing) fields[h.date]=h.name;
    fields[d]=n;
    await redis.hset(key,fields);
  }
  return getHolidays(y);
}
async function deleteHoliday(year,date){
  requireRedis();
  const y=validateYear(year);
  const d=validateDate(date,y);
  await ensureRedisInitialized();
  const key=holidayKey(y);
  const keyType=String(await redis.type(key) || "none").toLowerCase();
  if(keyType==="none") return [];
  if(keyType==="hash") {
    await redis.hdel(key,d);
  } else {
    const remaining=(await getHolidays(y)).filter(h=>h.date!==d);
    await redis.del(key);
    if(remaining.length){const fields={};for(const h of remaining)fields[h.date]=h.name;await redis.hset(key,fields);}
  }
  return getHolidays(y);
}

module.exports={getOptions,addOption,deleteOption,getPeople,upsertPerson,deletePerson,getHolidays,addHoliday,deleteHoliday,isRedisConfigured:Boolean(redis)};
