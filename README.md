# PEJI-KB

PEJI-KB is a self-hosted knowledge base platform designed to organize educational resources, facilitate note-taking, and provide intelligent document interaction via AI integration (Retrieval-Augmented Generation).

It is built to allow students and developers to centralize PDF course materials, manage code snippets, and interact with their documents using Large Language Models (LLMs). It supports both **Local AI** (Ollama) for privacy and **Cloud AI** (OpenAI) for performance, in a flexible "Bring Your Own Key" (BYOK) architecture.

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

- **Contextual Chat:** Interact directly with PDF documents. The system extracts text from the current file and injects it into the AI model's context window.
- **Provider Agnostic (BYOK):** Built on an Adapter Pattern.
  - **Server Defaults:** Admins can set a default provider.
  - **User Overrides:** Each user can configure their own provider (**Ollama** or **OpenAI**) and API Keys via the Settings page.
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

- **Hybrid Authentication:** Supports standard Session-based auth (persistent via SQLite) for browsers and API Key (SHA-256) auth for scripts.
- **Administration Panel:** Interface for user management, API key revocation, file uploads, and account deletion.
- **Hardened Security:** Implements CSRF Protection, Content Security Policy (CSP), and Rate Limiting.
- **CI/CD Pipeline:** Fully automated testing, linting, secret scanning, and semantic release workflow.

---

## Technology Stack

- **Runtime:** Node.js (v18+)
- **Framework:** Express.js
- **Database:** SQLite (using `better-sqlite3` + `connect-sqlite3` for sessions)
- **Frontend:** Server-Side Rendering with EJS, Vanilla JavaScript (ES Modules), CSS Grid.
- **PDF Engine:** `pdfjs-dist` (Text Extraction) and native browser embedding.
- **Security:** `bcryptjs` (Hashing), `csurf` (CSRF), `helmet` concepts.

---

## Prerequisites

- **Node.js**: Version 18.0.0 or higher.
- **Ollama (Optional)**: Required only if you intend to use local AI models.
  - Recommended model: `mistral` or `llama3`.
  - Default URL: `http://127.0.0.1:11434`.
- **OpenAI API Key (Optional)**: Required if you or your users prefer using Cloud AI.

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

Create a `.env` file at the project root.
**Note:** AI variables defined here act as **Server Defaults**. Users can override them in their personal settings.

```ini
# Server Configuration
PORT=3000
NODE_ENV=development
APP_NAME="PEJI-KB"

# Security Secrets (Must be strong random strings)
SESSION_SECRET=change_this_to_a_long_random_string
ADMIN_CODE=SecretCodeToRegisterAsAdmin

# Default AI Configuration (Fallback)
AI_PROVIDER=ollama          # Options: 'ollama' or 'openai'
AI_MODEL=mistral            # e.g., 'mistral', 'gpt-3.5-turbo'
AI_API_URL=[http://127.0.0.1:11434/api/chat](http://127.0.0.1:11434/api/chat)  # Only for Ollama
# AI_API_KEY=sk-...         # Optional: Global OpenAI key (not recommended for public servers)

# System Prompt
# AI_SYSTEM_PROMPT="You are a precise technical assistant..."
```

---

## Project Architecture

The project follows a modular MVC (Model-View-Controller) architecture using ES Modules.

```text
peji-kb/
├── courses/              # Root directory for PDF content (auto-scanned)
├── data/                 # SQLite database storage (knowledge.db & sessions.db)
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

---

## Usage Guide

### Administrator Registration

1.  Navigate to `/register`.
2.  Enter a username and password.
3.  In the **Admin Code** field, enter the value defined in your `.env` file (`ADMIN_CODE`).
4.  This grants access to the `/admin` dashboard.

### Configuring AI (Bring Your Own Key)

Users can configure their preferred AI provider individually:

1.  Log in and go to **Settings**.
2.  Locate the **AI Configuration** section.
3.  Select a **Provider**:
    - **Ollama (Local):** Specify your local URL (default: `http://localhost:11434`) and Model (e.g., `mistral`).
    - **OpenAI (Cloud):** Provide your personal `sk-...` API Key and Model (e.g., `gpt-4o`).
4.  Click **Save**. The chat interface will now use this configuration.

### Using the AI Chat

1.  Navigate to a document via the file explorer.
2.  Open the Tools Panel (Sidebar) and select the **AI Chat** tab.
3.  Ask a question. The system will retrieve context from the PDF and query the configured provider.

### Managing API Keys

1.  Go to **Settings**.
2.  Under "Developer Tools", create a new API Key.
3.  Use this key in the `X-API-Key` header for external scripts or CI/CD integrations.

---

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

---

## License

This project is distributed under the MIT License. See the `LICENSE` file for more information.
