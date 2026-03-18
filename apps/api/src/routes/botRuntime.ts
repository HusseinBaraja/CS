import QRCode from 'qrcode';
import { Hono } from 'hono';
import {
  DEFAULT_BOT_RUNTIME_RECONNECT_BACKOFF,
  getBotRuntimeReconnectDelayMs,
  getBotRuntimeNextActionHint,
  getBotRuntimeOperatorState,
  getBotRuntimeOperatorSummary,
  isBotRuntimeOperatorHealthy,
  type BotRuntimeOperatorSnapshot,
} from '@cs/shared';
import { createErrorResponse } from '../responses';
import type { BotRuntimeService } from '../services/botRuntime';
import { BotRuntimeServiceError } from '../services/botRuntime';

export interface BotRuntimeRoutesOptions {
  botRuntimeService: BotRuntimeService;
  now?: () => number;
}

const isServiceError = (error: unknown): error is BotRuntimeServiceError =>
  error instanceof BotRuntimeServiceError;

const getLastUpdatedAt = (snapshot: BotRuntimeOperatorSnapshot): number | undefined => {
  const timestamps = [
    snapshot.session?.updatedAt,
    snapshot.pairing?.updatedAt,
  ].filter((value): value is number => value !== undefined);

  return timestamps.length > 0 ? Math.max(...timestamps) : undefined;
};

const toSessionView = async (
  snapshot: BotRuntimeOperatorSnapshot,
  now: number,
) => {
  const operatorState = getBotRuntimeOperatorState(snapshot, now);
  const summary = getBotRuntimeOperatorSummary(snapshot, now);
  const nextRetryAt =
    snapshot.session?.state === "reconnecting"
      ? snapshot.session.updatedAt + getBotRuntimeReconnectDelayMs(
        snapshot.session.attempt,
        DEFAULT_BOT_RUNTIME_RECONNECT_BACKOFF,
      )
      : undefined;
  const pairingSvg =
    snapshot.pairing && snapshot.pairing.expiresAt > now && snapshot.pairing.qrText
      ? await QRCode.toString(snapshot.pairing.qrText, {
        errorCorrectionLevel: "M",
        margin: 1,
        type: "svg",
        width: 256,
      })
      : undefined;

  return {
    companyId: snapshot.companyId,
    name: snapshot.name,
    ownerPhone: snapshot.ownerPhone,
    timezone: snapshot.timezone,
    sessionKey: snapshot.sessionKey,
    operatorState,
    summary,
    isHealthy: isBotRuntimeOperatorHealthy(snapshot, now),
    ...(getBotRuntimeNextActionHint(snapshot, now) !== undefined
      ? { nextActionHint: getBotRuntimeNextActionHint(snapshot, now) }
      : {}),
    ...(nextRetryAt !== undefined ? { nextRetryAt } : {}),
    ...(getLastUpdatedAt(snapshot) !== undefined ? { lastUpdatedAt: getLastUpdatedAt(snapshot) } : {}),
    session: snapshot.session,
    pairing: snapshot.pairing ? {
      state: snapshot.pairing.expiresAt > now ? "ready" : "expired",
      updatedAt: snapshot.pairing.updatedAt,
      expiresAt: snapshot.pairing.expiresAt,
    } : {
      state: "none",
    },
    ...(pairingSvg !== undefined ? { pairingSvg } : {}),
  };
};

export const renderBotRuntimeShell = (initialCompanyId?: string): string => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>CSCB Bot Runtime</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f5efe5;
        --card: #fffaf2;
        --ink: #1d1b18;
        --muted: #6e665d;
        --line: #d8ccbc;
        --accent: #0c6d62;
        --warn: #9a5b00;
        --bad: #9f2d2d;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: Georgia, "Times New Roman", serif;
        background:
          radial-gradient(circle at top left, rgba(12, 109, 98, 0.12), transparent 32%),
          linear-gradient(180deg, #faf5ec 0%, var(--bg) 100%);
        color: var(--ink);
      }
      main { max-width: 1200px; margin: 0 auto; padding: 32px 20px 56px; }
      header { display: grid; gap: 10px; margin-bottom: 24px; }
      h1 { margin: 0; font-size: clamp(2rem, 4vw, 3rem); }
      p { margin: 0; color: var(--muted); line-height: 1.5; }
      .toolbar, .group, .empty, .error, .card {
        border: 1px solid var(--line);
        background: var(--card);
        border-radius: 18px;
        box-shadow: 0 18px 40px rgba(58, 46, 24, 0.06);
      }
      .toolbar {
        display: grid;
        gap: 12px;
        padding: 18px;
        margin-bottom: 20px;
      }
      .toolbar-row {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        align-items: center;
      }
      input, button, select {
        font: inherit;
        border-radius: 999px;
        border: 1px solid var(--line);
        padding: 10px 14px;
      }
      input, select { background: #fff; min-width: 220px; }
      button {
        background: var(--accent);
        color: white;
        border-color: var(--accent);
        cursor: pointer;
      }
      button.secondary {
        background: transparent;
        color: var(--ink);
      }
      .meta { display: flex; flex-wrap: wrap; gap: 12px; color: var(--muted); font-size: 0.95rem; }
      .group {
        padding: 18px;
        margin-top: 18px;
      }
      .group h2 { margin: 0 0 14px; font-size: 1.2rem; text-transform: capitalize; }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        gap: 14px;
      }
      .card { padding: 18px; display: grid; gap: 12px; }
      .card strong { font-size: 1.1rem; }
      .badge {
        display: inline-flex;
        align-items: center;
        width: fit-content;
        border-radius: 999px;
        padding: 5px 10px;
        font-size: 0.85rem;
        background: rgba(12, 109, 98, 0.12);
        color: var(--accent);
      }
      .badge.warn { background: rgba(154, 91, 0, 0.12); color: var(--warn); }
      .badge.bad { background: rgba(159, 45, 45, 0.12); color: var(--bad); }
      .kv { display: grid; gap: 6px; font-size: 0.95rem; color: var(--muted); }
      .qr {
        padding: 12px;
        background: white;
        border-radius: 14px;
        border: 1px solid var(--line);
      }
      .qr svg { width: 100%; height: auto; display: block; }
      .empty, .error { padding: 20px; margin-top: 18px; }
      .error { color: var(--bad); }
      @media (max-width: 640px) {
        main { padding-inline: 14px; }
        .toolbar-row { flex-direction: column; align-items: stretch; }
        input, select, button { width: 100%; }
      }
    </style>
  </head>
  <body>
    <main>
      <header>
        <h1>Bot Runtime Operator View</h1>
        <p>Pair unconnected tenants, inspect reconnect loops, and verify runtime health without a dashboard.</p>
      </header>
      <section class="toolbar">
        <div class="toolbar-row">
          <input id="api-key" type="password" placeholder="Enter API key" autocomplete="off" />
          <button id="save-key" type="button">Save API Key</button>
          <button id="clear-key" type="button" class="secondary">Forget Key</button>
          <select id="company-filter">
            <option value="">All tenants</option>
          </select>
        </div>
        <div class="meta">
          <span id="status-line">Enter an API key to load runtime status.</span>
          <span id="updated-line"></span>
        </div>
      </section>
      <section id="content"></section>
    </main>
    <script>
      const STORAGE_KEY = "cs.bot.runtime.apiKey";
      const initialCompanyId = ${JSON.stringify(initialCompanyId ?? "")};
      const content = document.getElementById("content");
      const apiKeyInput = document.getElementById("api-key");
      const saveKeyButton = document.getElementById("save-key");
      const clearKeyButton = document.getElementById("clear-key");
      const companyFilter = document.getElementById("company-filter");
      const statusLine = document.getElementById("status-line");
      const updatedLine = document.getElementById("updated-line");
      let pollId;

      const loadApiKey = () => sessionStorage.getItem(STORAGE_KEY) ?? "";
      const saveApiKey = (value) => sessionStorage.setItem(STORAGE_KEY, value);
      const clearApiKey = () => sessionStorage.removeItem(STORAGE_KEY);

      const escapeHtml = (value) =>
        String(value)
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;");

      const formatRelativeTime = (timestamp) => {
        if (!timestamp) return "unknown";
        const deltaSeconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
        if (deltaSeconds < 60) return deltaSeconds + "s ago";
        if (deltaSeconds < 3600) return Math.round(deltaSeconds / 60) + "m ago";
        return Math.round(deltaSeconds / 3600) + "h ago";
      };

      const formatCountdown = (timestamp) => {
        if (!timestamp) return "n/a";
        const deltaSeconds = Math.max(0, Math.round((timestamp - Date.now()) / 1000));
        return deltaSeconds + "s";
      };

      const badgeClass = (operatorState) => {
        if (operatorState === "healthy") return "badge";
        if (operatorState === "awaiting_pairing" || operatorState === "reconnecting") return "badge warn";
        return "badge bad";
      };

      const renderCards = (sessions) => {
        if (sessions.length === 0) {
          content.innerHTML = '<div class="empty">No tenant sessions matched the current filter.</div>';
          return;
        }

        const groups = new Map();
        for (const session of sessions) {
          const key = session.operatorState;
          const existing = groups.get(key) ?? [];
          existing.push(session);
          groups.set(key, existing);
        }

        const sections = Array.from(groups.entries()).map(([state, entries]) => {
          const cards = entries.map((entry) => {
            const qrBlock = entry.pairingSvg
              ? '<div class="qr">' + entry.pairingSvg + '</div>'
              : entry.pairing.state === "expired"
                ? '<div class="badge warn">QR expired, waiting for refresh</div>'
                : "";
            const retryBlock = entry.nextRetryAt
              ? '<div>Next retry in ' + escapeHtml(formatCountdown(entry.nextRetryAt)) + '</div>'
              : "";
            const disconnectBlock = entry.session?.disconnectCode !== undefined
              ? '<div>Disconnect code: ' + escapeHtml(entry.session.disconnectCode) + '</div>'
              : "";

            return '<article class="card">' +
              '<div class="' + badgeClass(entry.operatorState) + '">' + escapeHtml(entry.operatorState.replaceAll("_", " ")) + '</div>' +
              '<strong>' + escapeHtml(entry.name) + '</strong>' +
              '<div class="kv">' +
                '<div>' + escapeHtml(entry.summary.text) + '</div>' +
                '<div>Owner: ' + escapeHtml(entry.ownerPhone) + '</div>' +
                '<div>Updated: ' + escapeHtml(formatRelativeTime(entry.lastUpdatedAt)) + '</div>' +
                retryBlock +
                disconnectBlock +
                (entry.nextActionHint ? '<div>Next action: ' + escapeHtml(entry.nextActionHint) + '</div>' : '') +
              '</div>' +
              qrBlock +
            '</article>';
          }).join("");

          return '<section class="group"><h2>' + escapeHtml(state.replaceAll("_", " ")) + '</h2><div class="grid">' + cards + '</div></section>';
        }).join("");

        content.innerHTML = sections;
      };

      const syncFilterOptions = (sessions) => {
        const previousValue = companyFilter.value || initialCompanyId;
        const options = ['<option value="">All tenants</option>'];
        for (const session of sessions) {
          options.push('<option value="' + escapeHtml(session.companyId) + '">' + escapeHtml(session.name) + '</option>');
        }
        companyFilter.innerHTML = options.join("");
        companyFilter.value = sessions.some((session) => session.companyId === previousValue) ? previousValue : "";
      };

      const fetchSessions = async () => {
        const apiKey = loadApiKey();
        if (!apiKey) {
          statusLine.textContent = "Enter an API key to load runtime status.";
          updatedLine.textContent = "";
          content.innerHTML = '<div class="empty">The operator page is waiting for API authentication.</div>';
          return;
        }

        statusLine.textContent = "Loading runtime status...";
        const response = await fetch("/api/runtime/bot/sessions", {
          headers: {
            Authorization: "Bearer " + apiKey,
          },
        });

        if (!response.ok) {
          const failure = await response.json().catch(() => null);
          const message = failure?.error?.message ?? "Request failed";
          throw new Error(message);
        }

        const payload = await response.json();
        const sessions = Array.isArray(payload.sessions) ? payload.sessions : [];
        syncFilterOptions(sessions);
        const filteredSessions = companyFilter.value
          ? sessions.filter((session) => session.companyId === companyFilter.value)
          : sessions;

        renderCards(filteredSessions);
        statusLine.textContent = sessions.length + " tenant session(s) loaded.";
        updatedLine.textContent = "Updated " + new Date(payload.generatedAt).toLocaleTimeString();
      };

      const refresh = async () => {
        try {
          await fetchSessions();
        } catch (error) {
          statusLine.textContent = "Runtime status could not be loaded.";
          updatedLine.textContent = "";
          content.innerHTML = '<div class="error">' + escapeHtml(error instanceof Error ? error.message : String(error)) + '</div>';
        }
      };

      saveKeyButton.addEventListener("click", () => {
        saveApiKey(apiKeyInput.value.trim());
        refresh();
      });
      clearKeyButton.addEventListener("click", () => {
        clearApiKey();
        apiKeyInput.value = "";
        refresh();
      });
      companyFilter.addEventListener("change", () => {
        refresh();
      });

      apiKeyInput.value = loadApiKey();
      if (initialCompanyId) {
        companyFilter.value = initialCompanyId;
      }

      refresh();
      pollId = window.setInterval(refresh, 5000);
      window.addEventListener("beforeunload", () => window.clearInterval(pollId));
    </script>
  </body>
</html>`;

export const createBotRuntimeRoutes = (
  options: BotRuntimeRoutesOptions,
) => {
  const app = new Hono();
  const now = options.now ?? Date.now;

  app.get("/sessions", async (c) => {
    try {
      const timestamp = now();
      const snapshots = await options.botRuntimeService.listOperatorSnapshots();
      const sessions = await Promise.all(snapshots.map((snapshot) => toSessionView(snapshot, timestamp)));

      return c.json({
        ok: true,
        generatedAt: timestamp,
        sessions,
      });
    } catch (error) {
      if (isServiceError(error)) {
        return c.json(createErrorResponse(error.code, error.message), error.status as any);
      }

      throw error;
    }
  });

  return app;
};
