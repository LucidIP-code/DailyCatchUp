# Project Architecture, Flow & Technical Insights

## 📌 Executive Summary
**IP Daily CatchUp** is a full-stack daily task tracking and team status reporting web application. It enables team members to quickly submit daily status updates grouped by project, manage leave/permission states, look up historical task entries, and automatically format structured daily catch-up reports for Microsoft Teams / Email distribution.

The application uses **Google Sheets** as a spreadsheet database back-end and supports dual-mode deployment:
1. **Local Node.js/Express Server** via `node server.js`
2. **Serverless Platform (Vercel)** via `api/*.js` handlers defined in `vercel.json`

---

## 🏗️ Architecture & Component Overview

```
                        ┌──────────────────────────────────────────────┐
                        │              Browser Front-End               │
                        │ (index.html, previous-status-ui.js, CSS/UI)  │
                        └──────────────────────┬───────────────────────┘
                                               │ HTTP / REST API
                        ┌──────────────────────▼───────────────────────┐
                        │          Express / Serverless API            │
                        │         (server.js / api/*.js)               │
                        └──────────────┬───────────────┬───────────────┘
                                       │               │
            ┌──────────────────────────▼──┐         ┌──▼──────────────────────────┐
            │   Google Sheets API (v4)    │         │  Storage Layer (storage.js) │
            │ (Service Account / OAuth2)  │         │ (Upstash Redis / data.json) │
            └─────────────────────────────┘         └─────────────────────────────┘
```

### 1. Front-End Layer (`public/`)
* **`index.html`**: Main Single Page Application (SPA) containing forms for name selection, dynamic task row creation, project pickers, daily status summary feed, and custom modal dialogs. Features:
  * **Cosmic Earth-to-Moon Loader (`#ag-loader`):** Animated page initialization featuring pixel-art Earth, Mars floating in deep space, rocket trajectory flight, touchdown on the Moon with flag planting animation, and staged status updates (`🚀 LAUNCHING FROM EARTH...` -> `🌌 TRAVERSING THE COSMOS...` -> `🌕 TOUCHDOWN ON THE MOON!`).
  * **Custom Portal Modal Dialogs:** Uses dark-themed custom confirmation modals (`showThemeConfirmModal`) replacing default browser `confirm()` popups.
* **`previous-status-ui.js`**: Client-side module managing individual status actions:
  * **Use Previous Day Status:** Retrieves the last filled tasks for a person.
  * **Mark On Leave (🏖️):** Saves `"On Leave"` to the sheet and hides task entry fields.
  * **Mark First Half Leave (🌅):** Saves `"First Half Leave"` and leaves task entry fields visible for second-half tasks.
  * **Mark On Permission (⏱️):** Saves `"On Permission"` and leaves task entry fields visible for remaining tasks.
  * **Status Panel & Confirmation Modals:** Renders active status banners and dark portal-themed confirmation dialogs.
* **`holiday-ui.js`**: UI modal for managing government/company holidays with custom dark-themed Add/Edit forms and confirmation dialogs.

### 2. Backend API Layer (`server.js` & `api/`)
* **Local Express Server (`server.js`)**: Serves static files from `public/` and exposes REST API endpoints locally on port 3000.
* **Vercel Serverless Functions (`api/`)**:
  * **`api/previous-status.js`**: Reads previous task entries and handles POST requests for `leave`, `first-half`, `permission`, and `unmark`.
  * **`api/daily-status.js`**: Generates today's daily status report by reading the current sheet tab.
  * **`api/options.js`**: Serves and updates team member names and project drop-down options.
  * **`api/people.js` & `api/people-feed.js`**: Manages team members and email mappings.
  * **`api/holidays.js` & `api/today-holiday-feed.js`**: Manages annual holiday schedules.

### 3. Report Engine (`report.js`)
* Processes raw rows retrieved from Google Sheets.
* Groups task entries by project headings (e.g. `Project Name - Task Details`).
* Generates dual output formats:
  1. **Plain Text:** Formatted with bullet points for easy copying into Microsoft Teams.
  2. **HTML:** Styled markup with action buttons (e.g., individual entry deletion).
* Handles special status strings: `"On Leave"`, `"First Half Leave"`, `"On Permission"`, and `"CatchUp Not Filled Yet"`.

### 4. Storage & Persistence (`storage.js`)
* Stores dynamic configuration data (team member names, projects, email mappings, holidays).
* **Vercel / Production:** Uses **Upstash Redis REST API** (supports both standard `KV_REST_API_*` and Upstash `UPSTASH_REDIS_REST_KV_REST_API_*` env vars).
* **Local Development:** Uses local JSON file fallback (`data.json`).

### 5. Google Sheets Integration (`googleapis`)
* Spreadsheet ID configured via `SPREADSHEET_ID` environment variable.
* Worksheets are automatically organized by month tab (e.g., `Sep-26`).
* Automatically populates weekday date rows (Saturdays and Sundays excluded).

---

## 🔄 Core User Workflows

### A. Submitting Daily Catch-Up Tasks
```
User selects Name & Project(s) ➔ Enters Task Bullets ➔ Clicks Submit
  └─> POST /api/submit-task
       └─> Checks/creates Month Tab (e.g., "Sep-26") in Google Sheet
       └─> Ensures Person Column exists in sheet header
       └─> Finds today's date row in Column A
       └─> Formats task text: "ProjectName - Line 1\n   Line 2"
       └─> Updates Google Sheet cell value
       └─> Reloads & re-renders Today's Status Report
```

### B. Leave & Permission Management Flow
```
User selects Name ➔ Clicks [Mark On Leave / First Half Leave / On Permission]
  └─> Dark Theme Modal Confirmation
       └─> POST /api/previous-status { name, action: "leave" | "first-half" | "permission" | "unmark" }
            └─> Writes status string to Google Sheet cell for today's date
            └─> Returns success message
  └─> Updates UI Status Panel & reloads Daily Status Summary
```

### C. Using Previous Day's Status
```
User selects Name ➔ Clicks "Use Previous Day Status"
  └─> GET /api/previous-status?name=PersonName
       └─> Scans backward through previous dates/tabs in Google Sheet
       └─> Ignores empty workdays, "On Leave", "First Half Leave", "On Permission"
       └─> Parses project headings and task details
  └─> Pre-fills task rows in the UI for quick editing
```

---

## 💡 Key Technical Insights & Gotchas

1. **Dual Server Support:**
   * When modifying API endpoints, ensure functionality is present in both `api/<route>.js` (for Vercel serverless) and `server.js` (for local Express execution).

2. **Google Sheets Date Key Formats:**
   * `findDateRow()` checks multiple date string variants (e.g., `28-Sep-26`, `28/09/2026`, `9/28/2026`) to safely match dates entered in different locale formats.

3. **Status String Hierarchy:**
   * Specific full-cell status strings (`On Leave`, `First Half Leave`, `On Permission`, `CatchUp Not Filled`) override standard task grouping logic in `report.js` and `parseStatus()`.

4. **Required Environment Variables (`.env`):**
   * `PORT`: Server port (default: 3000).
   * `SPREADSHEET_ID`: Target Google Sheet ID.
   * `GOOGLE_CLIENT_EMAIL` & `GOOGLE_PRIVATE_KEY`: Service account credentials (for cloud deployments).
   * `service_account.json`: Service account credentials file (for local development).
   * `UPSTASH_REDIS_REST_KV_REST_API_URL` & `UPSTASH_REDIS_REST_KV_REST_API_TOKEN`: Upstash Redis credentials for persistent cloud storage on Vercel and locally.

---

## 🛠️ Summary of Key Files

| File Path | Description |
| :--- | :--- |
| [`server.js`](file:///d:/Manoj/Personal%20Projects/IPDailyCatchUp/DailyCatchUp/server.js) | Main Express server entry point for local development. |
| [`report.js`](file:///d:/Manoj/Personal%20Projects/IPDailyCatchUp/DailyCatchUp/report.js) | Status report generator (Plain Text & HTML). |
| [`storage.js`](file:///d:/Manoj/Personal%20Projects/IPDailyCatchUp/DailyCatchUp/storage.js) | Storage abstraction for names, projects, emails, and holidays with Upstash Redis REST support. |
| [`api/previous-status.js`](file:///d:/Manoj/Personal%20Projects/IPDailyCatchUp/DailyCatchUp/api/previous-status.js) | Handles Previous Day status lookup and Leave/Permission state updates. |
| [`public/previous-status-ui.js`](file:///d:/Manoj/Personal%20Projects/IPDailyCatchUp/DailyCatchUp/public/previous-status-ui.js) | Front-end controller for status buttons (including On Permission ⏱️), modals, and auto-fill. |
| [`public/holiday-ui.js`](file:///d:/Manoj/Personal%20Projects/IPDailyCatchUp/DailyCatchUp/public/holiday-ui.js) | Holiday management UI controller with custom Add/Edit modals and date pickers. |
| [`public/people-email-ui.js`](file:///d:/Manoj/Personal%20Projects/IPDailyCatchUp/DailyCatchUp/public/people-email-ui.js) | Person email mapping input controller for Manage Names. |
| [`public/styles.css`](file:///d:/Manoj/Personal%20Projects/IPDailyCatchUp/DailyCatchUp/public/styles.css) | Core application styles (Card layout container max-width 810px, Earth-to-Moon loader animations, email/date/number input themes). |
| [`public/index.html`](file:///d:/Manoj/Personal%20Projects/IPDailyCatchUp/DailyCatchUp/public/index.html) | Main web interface HTML markup, Earth-to-Moon page loader DOM structure & staged text loader script, and global `showThemeConfirmModal` helper. |
| [`version.txt`](file:///d:/Manoj/Personal%20Projects/IPDailyCatchUp/DailyCatchUp/version.txt) | Complete log of git commits and change descriptions. |
