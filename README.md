# DailyCatchUp

DailyCatchUp is a lightweight daily task-tracking application. Team members can submit their work updates, manage the available names and projects, and generate a daily status report. Task data is stored in a Google Spreadsheet, while the application provides a simple Express-based API and web interface.

## Features

- Submit daily tasks for a selected team member
- Organize tasks by project
- Add, sort, and remove team members and projects
- Store daily updates in Google Sheets
- Automatically create a monthly spreadsheet tab when needed
- Generate a daily status report from the spreadsheet data
- Clear a person's task entry for the current day
- Run locally or deploy to Vercel

## Project Structure

```text
DailyCatchUp/
├── public/              # Frontend files
├── server.js            # Express server and Google Sheets integration
├── report.js            # Daily report generation logic
├── data.json            # Names and project configuration for local use
├── package.json         # Node.js dependencies and scripts
├── vercel.json          # Vercel deployment configuration
└── README.md            # Project documentation
```

## How It Works

The browser communicates with the Express API. When an endpoint needs spreadsheet data, the server uses the Google Sheets API to read or update the configured spreadsheet.

```text
Browser
   |
   | HTTP requests
   v
Express API (server.js)
   |
   | GoogleAuth
   v
Google Sheets API
   |
   v
Configured Google Spreadsheet
```

The application creates a monthly sheet using a name such as `Aug-26` when the current month's tab does not already exist. The new sheet is initialized with a `Date` column and the currently configured team members.

## Authentication

DailyCatchUp uses a **Google Service Account** for server-to-server authentication with the Google Sheets API.

### Production / Vercel

Set the following environment variables:

```env
GOOGLE_CLIENT_EMAIL=your-service-account@your-project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
SPREADSHEET_ID=your-google-spreadsheet-id
```

The application converts escaped newline characters in `GOOGLE_PRIVATE_KEY` back into real newlines before passing the credentials to Google's authentication library.

### Local Development

For local development, if `GOOGLE_CLIENT_EMAIL` and `GOOGLE_PRIVATE_KEY` are not provided, the application looks for:

```text
service_account.json
```

Place the Google service-account key file in the project root. Do not commit this file to Git.

The repository's `.gitignore` excludes both `.env` and `service_account.json`.

### Google Sheets Permissions

The target spreadsheet must be shared with the Google service account's email address and granted sufficient permissions to read and update the sheet.

## Installation

### Prerequisites

- Node.js
- A Google Cloud project with the Google Sheets API enabled
- A Google service account
- A Google Spreadsheet shared with that service account

### Install dependencies

```bash
npm install
```

### Configure environment variables

Create a `.env` file for local configuration if you prefer environment variables:

```env
GOOGLE_CLIENT_EMAIL=your-service-account@your-project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
SPREADSHEET_ID=your-google-spreadsheet-id
```

Alternatively, use a `service_account.json` file in the project root for local development and set:

```env
SPREADSHEET_ID=your-google-spreadsheet-id
```

### Start the application

```bash
node server.js
```

The server uses `PORT` when provided, otherwise it starts on port `3000`.

## API Overview

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/options` | GET | Get configured names and projects |
| `/api/options` | POST | Add a name or project |
| `/api/options` | DELETE | Remove a name or project |
| `/api/sheet-url` | GET | Get the configured Google Sheet URL |
| `/api/daily-status` | GET | Generate the current daily status report |
| `/api/submit-task` | POST | Save tasks for a team member |
| `/api/delete-task` | POST | Clear a team member's task entry for today |

## Data Storage

The application uses two types of storage:

1. **Google Sheets** stores daily task entries and monthly tabs.
2. **`data.json`** stores the available names and projects used by the application.

On Vercel, the application uses `/tmp/data.json` for its writable runtime copy. This means local option changes should not be treated as durable deployment storage unless an external persistent store is added.

## Security Notes

Google credentials are kept on the server and are not intended to be sent to the browser. Access tokens for the Google Sheets API are managed by the Google authentication library.

At present, the application API does not implement an end-user login, JWT, session, or other visible application-level authorization mechanism. If the application is publicly deployed, consider adding authentication and authorization before exposing task submission or deletion endpoints.

Recommended improvements include:

- Add user authentication
- Restrict API access to authorized users
- Validate and sanitize request data
- Apply rate limiting to public endpoints
- Use persistent storage instead of the Vercel temporary filesystem for configuration data
- Follow least-privilege permissions for the Google service account

## Deployment

The repository includes `vercel.json` for Vercel deployment. Configure the Google credentials and `SPREADSHEET_ID` as Vercel environment variables rather than committing secrets to the repository.

## License

No license has been specified for this repository.
