# HireIQ Capstone: AI & Data Structures Learning Log

Welcome to the master Learning Log for the **HireIQ Capstone Project**. This document serves as a comprehensive, step-by-step record of the entire development lifecycle, including every installation error, architectural decision, and technical resolution we encountered.

Use this as a master study guide for your engineering interviews.

---

## 1. Initial Setup & Environment Configuration

### Frontend & Backend Bootstrapping
* **Step Taken**: Initialized a React SPA using Vite (`npm create vite@latest`) and a Python backend using FastAPI and Uvicorn.
* **Installation Error Encountered**: The frontend Vite server crashed immediately with the error: `Error: Cannot find module '@rolldown/binding-darwin-arm64'`.
* **Root Cause**: There is a known bug in `npm` on Apple Silicon (M-series MacBooks) where it occasionally fails to download platform-specific native binary bindings for Rust-based bundlers like Rolldown.
* **Resolution**: We manually bypassed the bug by explicitly installing the missing native binary: `npm install @rolldown/binding-darwin-arm64 --no-save`, which allowed the Vite dev server to start flawlessly.

---

## 2. Phase 1: Asynchronous Request Handling (Data Structures)

### The Queue (Buffer)
* **Concept Used**: In-Memory Queue (`asyncio.Queue`).
* **Problem**: Resume parsing and vector embedding are computationally heavy. If done synchronously, the HTTP request would timeout, blocking the UI and preventing other users from uploading.
* **Implementation**: We decoupled ingestion from processing. The `/upload` endpoint simply accepts the file bytes, places them in the `asyncio.Queue`, and immediately returns a `202 Accepted`. A background worker consumes this queue sequentially.

### The Hash Map (Dictionary)
* **Concept Used**: Hash Map (`dict`).
* **Problem**: Since the upload request returns instantly, the frontend needs a way to know when the background processing is actually finished.
* **Implementation**: The backend generates a unique `job_id` (UUID) and creates an entry in an in-memory dictionary. The frontend polls a `/status/{job_id}` endpoint every 1000ms. Because Hash Maps offer **O(1) time complexity** for lookups, this polling endpoint is incredibly fast and cheap to execute.

---

## 3. Phase 2 & 3: Advanced RAG and LangGraph Agents

### AI Dependencies Setup
* **Step Taken**: Installed the core AI packages: `pip install langchain langgraph chromadb sentence-transformers pypdf langchain-community`.

### Vector Indexes and Embeddings
* **Concept Used**: `HuggingFaceEmbeddings` with `all-MiniLM-L6-v2`.
* **Implementation**: Transformed unstructured PDF text into dense mathematical vectors, allowing the system to perform semantic similarity searches (e.g., matching "Frontend Dev" to "React") rather than brittle exact-keyword searches.

### Directed Acyclic Graphs (DAG)
* **Concept Used**: `langgraph.graph.StateGraph`.
* **Implementation**: Orchestrated the entire workflow as a state machine: `Parse Node -> Embed Node -> Extract Node -> Evaluate Node`. This makes the code highly modular and allows state to be passed cleanly between nodes using `AgentState`.

### The Gemini Quota Crisis & Graceful Degradation
* **Error Encountered**: When we wired up the `ChatGoogleGenerativeAI` node, we hit multiple severe errors. First, a `503 UNAVAILABLE` (model routing overload), and then a `429 RESOURCE_EXHAUSTED` with `limit: 0` (meaning the API key was completely blocked from Free Tier access).
* **Architectural Resolution**: Instead of letting the application crash with a 500 Internal Server Error, we implemented an enterprise pattern called **Graceful Degradation**. 
* **How it works**: The `extract_node` wraps the LLM call in a `try/except` block. If the API throws a Quota error, the node catches it and falls back to a locally executed Python Regex/Heuristic engine to parse the skills manually. The LangGraph state continues seamlessly, and the frontend never crashes.

### Swapping to a Local LLM (Ollama)
* **Step Taken**: To solve the API dependency permanently and ensure 100% data privacy for candidate resumes, we transitioned from Google Gemini to a completely local model.
* **Implementation**: We ran `ollama pull llama3.2` to download a lightweight, hyper-fast 3-Billion parameter model optimized for Apple Silicon. We swapped two lines of code in our LangChain setup to use `ChatOllama(model="llama3.2")`.

---

## 4. Phase 4 & 5: UI Overhaul, Streaming, and Batch Processing

### Frontend Syntax Crash
* **Error Encountered**: While overhauling the React UI to add an interactive loading stepper, Vite crashed with `[PARSE_ERROR] Invalid Unicode escape sequence`.
* **Root Cause**: The string literal inside the React JSX `style={{ width: ... }}` contained incorrectly escaped backticks and dollar signs `\`\${...}\``.
* **Resolution**: Cleaned up the template literal syntax to natively interpolate the JavaScript variables.

### Masking CPU Latency (Perceived Performance)
* **Problem**: Loading local HuggingFace embedding models (`SentenceTransformers`) on a CPU causes a 3-5 second "cold start" delay. The basic UI just showed a spinning circle, making it feel like the app froze.
* **Resolution**: Implemented an animated **Visual Progress Stepper** in React. Using a `setInterval`, the frontend simulates progress by cycling through text (`Parsing PDF...` -> `Vectorizing Data...` -> `Evaluating...`), successfully masking the backend latency and improving UX tremendously.

### Batch Uploading & The Power of the Queue
* **Feature Added**: Allowed the user to upload 10+ resumes simultaneously.
* **Why it worked flawlessly**: Because we designed the backend with the `asyncio.Queue` in Phase 1, the frontend could fire off 10 concurrent HTTP POST requests simultaneously. The FastAPI server absorbed the massive spike instantly without dropping a single connection, queuing them up for the background worker to process one by one.

### In-Browser CSV Export
* **Feature Added**: A button to download the finalized, ranked AI Shortlist.
* **Implementation**: Instead of building a complex backend endpoint to generate an Excel file, we used pure JavaScript to aggregate the React state into a CSV-formatted string, prefix it with a Data URI, and programmatically trigger a local file download, saving backend compute resources.

---

## 5. Phase 6: V3 Streaming & Real-Time AI Metrics

### Server-Sent Events (SSE) vs Polling
* **Architectural Pivot**: Transitioned from a 1000ms HTTP Polling structure to Server-Sent Events (SSE).
* **Problem with Polling**: Polling requires establishing a new TCP connection every second, sending HTTP headers back and forth, and flooding the server with useless requests if the backend is slow. It wastes bandwidth and compute.
* **The SSE Solution**: SSE uses a single, long-lived uni-directional HTTP connection. The backend streams updates (`yield`) directly into the open socket. This provides true real-time UI updates with zero overhead.
* **The HTTP/1.1 Catch**: The only drawback to SSE is the HTTP/1.1 protocol limit of 6 concurrent connections per domain in modern browsers. If a recruiter uploads 10 resumes, only 6 will stream simultaneously, while the other 4 wait in the browser's queue. Moving to HTTP/2 solves this completely by allowing multiplexing over a single TCP connection.

### AI Metrics & True Progress Tracking
* **Feature Added**: Exposed LLM `token_usage` and execution time (`processing_time_sec`).
* **Implementation**: Refactored the LangGraph `invoke()` method into an asynchronous generator using `.astream()`. Instead of arbitrarily guessing progress in the UI with a timer, the backend now yields precise node transitions (`{"node": "embed"}`) over the SSE stream. This creates a 100% accurate, real-time progress stepper and verbose terminal log for the end-user, providing deep transparency into what the AI is doing at any exact millisecond.

---

## 6. Phase 7: Premium UI Redesign & AI Job Description Generator

### PDF Reload Bug Fix (Memory Leak & Render Thrashing)
* **Bug**: The PDF preview iframe was calling `URL.createObjectURL(file)` directly inside the JSX render function. Every time the user typed in the JD textarea, React re-rendered the component, which created a *new* blob URL on every keystroke, causing the PDF to reload continuously and leak memory.
* **Root Cause**: React functional components re-execute their entire body on every state change. Placing side-effects (like blob URL creation) directly in JSX is an anti-pattern.
* **Resolution**: We now create the blob URL exactly once — at upload time — and store it in the `JobState` as `pdfUrl`. The iframe simply reads this stable string on every render, preventing any reloads. This is a textbook example of **memoization** applied to DOM resources.

### Design System Overhaul
* **Problem**: The previous UI used generic system fonts, emoji icons, and excessive padding, resulting in a prototype-quality interface.
* **Resolution**: Built a complete CSS Design System with proper design tokens (`--bg-0` through `--bg-3`, `--text-0` through `--text-3`, semantic colors for `--accent`, `--green`, `--red`). Typography uses Google Fonts Inter (UI) and JetBrains Mono (terminals) with `font-feature-settings` for OpenType ligatures, and `font-variant-numeric: tabular-nums` for aligned numbers in metrics.

### SVG Score Ring Component
* **Feature Added**: Replaced plain text percentage badges with an animated SVG donut chart component (`ScoreRing`). It uses `stroke-dasharray` and `stroke-dashoffset` CSS animations to draw a circular progress ring that fills proportionally to the match score, with color-coded thresholds (green >70%, amber 40-70%, red <40%).

### KPI Dashboard Strip
* **Feature Added**: A horizontal KPI strip at the top of the results area showing aggregate metrics: Total Uploaded, Evaluated Count, Average Score, Average Processing Time, and Total Tokens consumed. This gives recruiters an instant, at-a-glance summary without scanning individual cards.

### Slide-Out Detail Drawer
* **Problem**: The previous implementation used a full-screen modal that hid the main dashboard. The user had to close it to return to the results.
* **Resolution**: Implemented a CSS `transform: translateX()` slide-out drawer from the right edge (520px wide). It overlays the content with a semi-transparent backdrop but does not destroy the underlying layout. The drawer contains the full AI scorecard, an expandable `<details>` accordion for Pipeline Logs, and an embedded `<iframe>` PDF viewer — all in one panel.

### Collapsible Pipeline Logs
* **Problem**: Verbose terminal logs for each processing file cluttered the main view and pushed other content off-screen.
* **Resolution**: Logs are now hidden by default. Each processing card has a terminal icon button that toggles inline logs via a `Set<string>` state variable. In the detail drawer, logs use a native HTML `<details>` accordion element, keeping the UI clean while still providing full transparency on demand.

### AI Job Description Generator
* **Feature Added**: A new `POST /generate-jd` endpoint backed by `ChatOllama(model="llama3.2")` that accepts a short user prompt (e.g., "React UI Dev") and returns a professionally written Job Description.
* **Frontend Integration**: Added a grid of predefined role templates (UI Developer, Backend Engineer, Data Scientist, DevOps) plus a free-text input with an AI sparkles button. Pressing Enter or clicking the button sends the prompt to the local LLM and populates the JD textarea with the generated output.

### Mock Resume Generation
* **Tool Used**: Python `reportlab` library.
* **Purpose**: Generated a pixel-perfect `Alex_UIDev_Resume.pdf` specifically crafted to score a high match against the UI Developer JD template. This allows us to demonstrate the full pipeline end-to-end without relying on real candidate data.
