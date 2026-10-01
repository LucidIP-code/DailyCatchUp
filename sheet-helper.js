const path = require("path");
const { google } = require("googleapis");
const { getOptions } = require("./storage");

const TIME_ZONE = process.env.APP_TIME_ZONE || "Asia/Kolkata";

// Google Sheets Auth Setup
const authOptions = {
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
};

if (process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
  authOptions.credentials = {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  };
} else {
  authOptions.keyFile = path.join(__dirname, "service_account.json");
}

const auth = new google.auth.GoogleAuth(authOptions);
const sheets = google.sheets({ version: "v4", auth });

/**
 * Returns date parts normalized to the application timezone (Asia/Kolkata by default)
 */
function getZonedDate(dateInput = new Date()) {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });
  const monthFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    month: "short",
  });

  const parts = Object.fromEntries(
    formatter.formatToParts(d).map(({ type, value }) => [type, value])
  );

  const year = parseInt(parts.year, 10);
  const month = parseInt(parts.month, 10) - 1; // 0-indexed
  const day = parseInt(parts.day, 10);

  const monthStr = monthFormatter.format(d); // e.g. "Oct"
  const dayPadded = String(day).padStart(2, "0");
  const monthNum = String(month + 1).padStart(2, "0");
  const shortYear = String(year).slice(-2);
  const fullYear = year;

  return {
    year,
    month,
    day,
    dayPadded,
    monthNum,
    monthStr,
    shortYear,
    fullYear,
  };
}

function getCurrentSheetName(dateInput) {
  const zoned = getZonedDate(dateInput);
  return `${zoned.monthStr}-${zoned.shortYear}`;
}

function getColumnLetter(colIndex) {
  let temp = "";
  let letter = "";
  let idx = colIndex;
  while (idx >= 0) {
    temp = idx % 26;
    letter = String.fromCharCode(temp + 65) + letter;
    idx = Math.floor(idx / 26) - 1;
  }
  return letter;
}

function getValidTodayKeys(dateInput) {
  const { day, dayPadded, monthStr, monthNum, shortYear, fullYear } = getZonedDate(dateInput);

  return [
    `${day}-${monthStr}-${shortYear}`,
    `${dayPadded}-${monthStr}-${shortYear}`,
    `${day}/${monthNum}/${fullYear}`,
    `${dayPadded}/${monthNum}/${fullYear}`,
    `${monthNum}/${dayPadded}/${fullYear}`,
    `${day}-${monthNum}-${fullYear}`,
    `${dayPadded}-${monthNum}-${fullYear}`,
  ].map(k => k.toLowerCase());
}

function generateMonthDates(dateInput) {
  const zoned = getZonedDate(dateInput);
  const daysInMonth = new Date(zoned.year, zoned.month + 1, 0).getDate();
  const dateRows = [];

  for (let day = 1; day <= daysInMonth; day++) {
    // Create Date object in UTC/local to check day of week for that specific month/year/day
    const date = new Date(zoned.year, zoned.month, day);
    const dayOfWeek = date.getDay();

    // Saturday (6) and Sunday (0) are standard weekly holidays.
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      continue;
    }

    dateRows.push([`${day}-${zoned.monthStr}-${zoned.shortYear}`]);
  }
  return dateRows;
}

async function ensureSheetExists(spreadsheetId, sheetName) {
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
  const sheetExists = spreadsheet.data.sheets.some(
    (s) => s.properties.title === sheetName
  );

  if (!sheetExists) {
    console.log(`📌 Tab '${sheetName}' missing. Creating new sheet...`);

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: sheetName } } }],
      },
    });

    const persistentData = await getOptions();
    const headers = ["Date", ...(persistentData.names || [])];
    const dates = generateMonthDates();
    const fullRows = [headers];

    dates.forEach((dateArr) => {
      fullRows.push([dateArr[0]]);
    });

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A1`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: fullRows },
    });

    console.log(`✅ Created tab '${sheetName}' with headers and dates.`);
  }
}

module.exports = {
  sheets,
  getZonedDate,
  getCurrentSheetName,
  getColumnLetter,
  getValidTodayKeys,
  generateMonthDates,
  ensureSheetExists,
};
