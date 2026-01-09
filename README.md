# PharmAssist 👨🏾‍⚕️

PharmAssist is an AI-powered pharmacy assistant designed to help customers find medications, check stock availability, and manage purchases efficiently. It leverages the Model Context Protocol (MCP) to provide a suite of tools that can be integrated with advanced AI models like Claude and Gemini.

## 🚀 Features

- **Medicine Search:** Search for medications based on symptoms, conditions, or names.
- **Stock Management:** Real-time stock availability checks for specific medicines.
- **Automated Notifications:** Notify administrators when stock is low or when specific actions are required.
- **Purchase Logging:** Seamlessly log transactions and purchases.
- **Alternative Suggestions:** Find alternative medications when a specific one is unavailable.
- **Detailed Information:** Get comprehensive details about various medicines.

## 🛠 Tech Stack

- **Language:** TypeScript / Node.js
- **AI Frameworks:** Anthropic Claude SDK, Google Generative AI (Gemini)
- **MCP Framework:** FastMCP
- **Storage:** Qdrant (Vector Database) for advanced searching capabilities
- **Tools:** Zod for schema validation, Puppeteer & Cheerio for data gathering, Axios for API interactions

## 📦 Project Structure

```
PharmAssist/
├── src/
│   ├── tools/          # MCP Tool implementations (Search, Stock, Purchase, etc.)
│   ├── storage/        # Database and storage logic (Qdrant)
│   ├── services/       # Business logic and external service integrations
│   ├── data/           # Sample data and datasets
│   ├── chat.ts         # Integration with Anthropic Claude
│   ├── gemni_chat.ts   # Integration with Google Gemini
│   └── index.ts        # MCP Server entry point
├── package.json        # Dependencies and scripts
└── tsconfig.json       # TypeScript configuration
```

## 🛠 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+ recommended)
- [pnpm](https://pnpm.io/)
- API Keys for Anthropic or Google Gemini (depending on which model you intend to use)

### Installation

1. Clone the repository:

   ```bash
   git clone <repository-url>
   cd PharmAssist
   ```

2. Install dependencies:

   ```bash
   pnpm install
   ```

3. Set up environment variables:
   Create a `.env` file in the root directory and add your API keys:

   ```env
   ANTHROPIC_API_KEY=your_anthropic_key
   GEMINI_API_KEY=your_gemini_key
   ```

   If you want the chat REPL to automatically load variables from this file, install the `dotenv` package:

   ```bash
   pnpm add dotenv
   ```

### Running the MCP Server

To start the PharmAssist MCP server:

```bash
pnpm tsx src/index.ts
```

The server will start over `stdio`, allowing it to be connected to MCP-compatible clients.

---

### Chat REPL (use MCP tools)

A simple CLI chat interface is provided so you can interact with the MCP tools directly from your terminal. It uses Google Generative AI under the hood and supports calling core tools like `SEARCH_MEDICINES` and `GET_MEDICINE_BY_ID`.

- Run the chat client:

```bash
pnpm chat
```

- Environment variables required:

  - `GOOGLE_API_KEY` or `GEMINI_API_KEY` — your Google Generative AI API key

- How it works:
  - Ask a question (e.g., "Find medicine for headache").
  - If the assistant needs to call a tool, it will emit a small JSON instruction like `{ "tool": "SEARCH_MEDICINES", "input": "headache" }`.
  - The CLI will execute the tool, return its result to the assistant, and the assistant will continue the conversation using the tool output.

This provides an easy way to experiment with the MCP tools in a conversational manner.

## 🤖 AI Integrations

### Claude Integration

The project includes a sample implementation for integrating with Claude in `src/chat.ts`.

### Gemini Integration

The project includes a robust multi-turn tool-calling implementation for Gemini in `src/gemni_chat.ts`.

## 🛠 Available MCP Tools

| Tool Name              | Description                                           |
| ---------------------- | ----------------------------------------------------- |
| `SEARCH_MEDS`          | Search for medicines based on names or symptoms.      |
| `CHECK_STOCK`          | Check availability for a specific medicine ID.        |
| `LOG_PURCHASE`         | Record a successful medication purchase.              |
| `NOTIFY_ADMIN`         | Alert administrators about stock issues or anomalies. |
| `FIND_ALTERNATIVES`    | Suggest replacement medications.                      |
| `GET_MEDICINE_DETAILS` | Retrieve detailed usage and safety information.       |

## 📜 License

This project is licensed under the ISC License - see the [LICENSE](LICENSE) file for details.
