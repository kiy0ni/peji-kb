# PEJI-KB

PEJI-KB is a self-hosted knowledge base platform designed to organize educational resources, facilitate note-taking, and provide intelligent document interaction via local AI integration (Retrieval-Augmented Generation).

It is built to allow students and developers to centralize PDF course materials, manage code snippets, and interact with their documents using Large Language Models (LLMs) like Ollama, all within a secure, privacy-focused environment.

## Table of Contents

1. [Key Features](#key-features)
2. [Technology Stack](#technology-stack)
3. [Prerequisites](#prerequisites)
4. [Installation](#installation)
5. [Configuration](#configuration)
6. [Project Architecture](#project-architecture)
7. [Usage Guide](#usage-guide)
8. [API Documentation](#api-documentation)
9. [License](#license)

---

## Key Features

### AI & Retrieval-Augmented Generation (RAG)

- **Contextual Chat:** Interact directly with PDF documents. The system extracts text from the current file and injects it into the AI model's context window to provide accurate, evidence-based answers.
- **Provider Agnostic:** Built on an Adapter Pattern, currently supporting **Ollama** (self-hosted) by default, with an architecture ready for OpenAI or Gemini integration.
- **Conversation History:** Maintains short-term memory of the chat session to support follow-up questions.

### Content Management

- **Recursive File Explorer:** Automatically scans and indexes the `courses/` directory to build a navigable tree structure.
- **Integrated PDF Reader:** Features a distraction-free "Zen Mode" and preserves reading sessions.
- **Favorites System:** Quick access pinning for frequently used documents.

### Productivity Tools

- **Markdown Editor:** Integrated EasyMDE editor for taking notes linked specifically to each document.
- **Snippet Manager:** Dedicated interface for saving, copying, and managing code blocks.
- **Activity Telemetry:** Tracks reading time and site usage for personal productivity analytics.

### Security & Administration

- **Hybrid Authentication:** Supports standard Session-based auth for browsers and API Key (SHA-256) auth for programmatic access.
- **Administration Panel:** Interface for user management, API key revocation, file uploads, and account deletion.
- **Hardened Security:** Implements CSRF Protection, Content Security Policy (CSP), Rate Limiting, and strict Input Sanitization.
- **Webhooks:** Event-driven architecture allowing external systems to subscribe to user activities (e.g., `reading.started`, `note.updated`).

---

## Technology Stack

- **Runtime:** Node.js (v18+)
- **Framework:** Express.js
- **Database:** SQLite (using `better-sqlite3` with Write-Ahead Logging)
- **Frontend:** Server-Side Rendering with EJS, Vanilla JavaScript (ES Modules), CSS Grid.
- **PDF Engine:** `pdfjs-dist` (Text Extraction) and native browser embedding.
- **Security:** `bcryptjs` (Password Hashing), `csurf` (CSRF), `helmet` concepts (CSP headers).

---

## Prerequisites

- **Node.js**: Version 18.0.0 or higher.
- **Ollama**: Required for local AI chat functionality.
  - Recommended model: `mistral` or `llama3`.
  - Ensure the Ollama server is running (default: `http://127.0.0.1:11434`).

---

## Installation

1.  **Clone the repository**

    ```bash
    git clone [https://github.com/your-org/peji-kb.git](https://github.com/your-org/peji-kb.git)
    cd peji-kb
    ```

2.  **Install dependencies**

    ```bash
    npm install
    ```

3.  **Prepare the environment**
    Create a `.env` file in the root directory based on the configuration section below.

4.  **Start the server**

    For development (with auto-reload):

    ```bash
    npm run dev
    ```

    For production:

    ```bash
    npm start
    ```

    The application will be accessible at `http://localhost:3000`.

---

## Configuration

Create a `.env` file at the project root with the following variables. Ensure secure secrets are used in production.

```ini
# Server Configuration
PORT=3000
NODE_ENV=development
APP_NAME="PEJI-KB"

# Security Secrets (Must be strong random strings)
SESSION_SECRET=change_this_to_a_long_random_string
ADMIN_CODE=SecretCodeToRegisterAsAdmin

# AI Configuration (Ollama)
AI_PROVIDER=ollama
AI_MODEL=mistral
AI_API_URL=[http://127.0.0.1:11434/api/chat](http://127.0.0.1:11434/api/chat)

# Optional System Prompt Override
# AI_SYSTEM_PROMPT="You are a precise technical assistant..."
````

-----

## Project Architecture

The project follows a modular MVC (Model-View-Controller) architecture using ES Modules.

```text
peji-kb/
├── courses/              # Root directory for PDF content (auto-scanned)
├── data/                 # SQLite database storage (knowledge.db)
├── src/
│   ├── config/           # Database initialization and constants
│   ├── controllers/      # Business logic (Auth, View, API, Chat, Admin)
│   ├── middlewares/      # Security, Uploads, Rate Limits, Auth Checks
│   ├── routes/           # URL endpoint definitions
│   ├── services/         # Complex logic (RAG, Webhooks, Auth Service)
│   ├── utils/            # Helpers (PDF Extraction, AI Adapter, File System)
│   └── views/            # EJS Templates (Pages & Partials)
├── public/               # Static assets (CSS, Client-side JS, Fonts)
├── server.mjs            # Application entry point
└── openapi.yaml          # API Specification
```

-----

## Usage Guide

### Administrator Registration

1.  Navigate to `/register`.
2.  Enter a username and password.
3.  In the **Admin Code** field, enter the value defined in your `.env` file (`ADMIN_CODE`).
4.  This grants access to the `/admin` dashboard for user and content management.

### Using the AI Chat

1.  Navigate to a document via the file explorer.
2.  Open the Tools Panel (Sidebar) and select the **AI Chat** tab.
3.  Ask a question regarding the document.
4.  The server performs the following:
      - Extracts text from the PDF.
      - Truncates context to fit the token window.
      - Queries the local LLM via the Adapter.
      - Returns the response and stores the history.

### Managing API Keys

1.  Go to **Settings**.
2.  Under the "Developer Tools" section, create a new API Key.
3.  Store the key immediately, as it is only shown once.
4.  Use this key in the `X-API-Key` header for external scripts.

-----

## API Documentation

PEJI-KB exposes a fully documented REST API compliant with the OpenAPI 3.1.0 specification.

  - **Spec File:** See `openapi.yaml` in the root directory.
  - **Base URL:** `/api/v1`

### Example: Retrieve User Identity

**Request:**

```bash
curl -X GET http://localhost:3000/api/v1/me \
  -H "X-API-Key: your_generated_api_key"
```

**Response:**

```json
{
  "user": {
    "id": 1,
    "username": "admin",
    "role": "admin"
  },
  "key": {
    "label": "DevScript",
    "scopes": "read:all write:self",
    "prefix": "a1b2c3d4"
  }
}
```

-----

## License

This project is distributed under the MIT License. See the `LICENSE` file for more information.
