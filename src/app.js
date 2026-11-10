import {
  CalcError,
  evaluate,
  formatNumber,
  isPlainNumber,
  preview,
  toExpressionString,
} from "./engine.js";

const STORAGE_KEYS = {
  history: "calculator.history.v1",
  theme: "calculator.theme.v1",
};

const MAX_HISTORY = 30;
const MAX_NUMBER_DIGITS = 15;
const MAX_EXPRESSION_LENGTH = 120;
const OPERATOR_PATTERN = /[+−×÷^*/]/;
const TRAILING_OPERATOR_PATTERN = /[+−×÷^*/]$/;
const TRAILING_NUMBER_PATTERN =
  /[−-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:e[+-]?\d+)?$/i;

const state = {
  expression: "",
  lastExpression: "",
  result: null,
  justEvaluated: false,
  error: null,
  history: loadHistory(),
  theme: "dark",
};

const elements = {
  calculator: document.querySelector(".calculator-panel"),
  display: document.querySelector(".display"),
  expression: document.querySelector("#expression"),
  result: document.querySelector("#result"),
  equalsMark: document.querySelector("#equalsMark"),
  announcer: document.querySelector("#announcer"),
  keypad: document.querySelector(".keypad"),
  historyPanel: document.querySelector("#historyPanel"),
  historyList: document.querySelector("#historyList"),
  historyEmpty: document.querySelector("#historyEmpty"),
  historyToggle: document.querySelector("#historyToggle"),
  historyClose: document.querySelector("#historyClose"),
  clearHistory: document.querySelector("#clearHistory"),
  themeToggle: document.querySelector("#themeToggle"),
  themeColor: document.querySelector('meta[name="theme-color"]'),
};

let resultAnimationTimer = null;

function readStorage(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Приватный режим или переполнение — приложение продолжает работать.
  }
}

function loadHistory() {
  const raw = readStorage(STORAGE_KEYS.history);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter(
        (item) =>
          item &&
          typeof item.expression === "string" &&
          item.expression.length <= MAX_EXPRESSION_LENGTH &&
          typeof item.result === "number" &&
          Number.isFinite(item.result),
      )
      .slice(0, MAX_HISTORY);
  } catch {
    return [];
  }
}

function saveHistory() {
  writeStorage(STORAGE_KEYS.history, JSON.stringify(state.history));
}

function getInitialTheme() {
  const saved = readStorage(STORAGE_KEYS.theme);
  if (saved === "light" || saved === "dark") {
    return saved;
  }

  return window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

function applyTheme(theme) {
  state.theme = theme;
  document.documentElement.dataset.theme = theme;

  if (elements.themeColor) {
    elements.themeColor.content = theme === "dark" ? "#0b0d12" : "#f3eee6";
  }

  if (elements.themeToggle) {
    const nextTheme = theme === "dark" ? "светлую" : "тёмную";
    elements.themeToggle.setAttribute(
      "aria-label",
      `Переключить на ${nextTheme} тему`,
    );
    elements.themeToggle.title = `Включить ${nextTheme} тему`;
  }
}

function toggleTheme() {
  const next = state.theme === "dark" ? "light" : "dark";
  applyTheme(next);
  writeStorage(STORAGE_KEYS.theme, next);
}

function resetCalculation() {
  state.expression = "";
  state.lastExpression = "";
  state.result = null;
  state.justEvaluated = false;
  state.error = null;
}

function updateExpression(nextExpression) {
  if (nextExpression.length > MAX_EXPRESSION_LENGTH) {
    return;
  }

  state.expression = nextExpression;
  state.error = null;
  state.justEvaluated = false;
  updateDisplay();
}

function getTrailingNumber(expression) {
  return expression.trimEnd().match(TRAILING_NUMBER_PATTERN);
}

function hasOperator(expression) {
  return /[+−×÷^%()]/.test(expression);
}

function inputDigit(digit) {
  if (state.error) {
    resetCalculation();
  }

  if (state.justEvaluated) {
    resetCalculation();
  }

  const token = getTrailingNumber(state.expression);

  if (token) {
    const tokenText = token[0];
    const digitCount = (tokenText.match(/\d/g) || []).length;

    if (digitCount >= MAX_NUMBER_DIGITS) {
      return;
    }

    let nextExpression = state.expression;

    if (/^[−-]?0$/.test(tokenText)) {
      const sign = /^[−-]/.test(tokenText) ? tokenText[0] : "";
      nextExpression =
        state.expression.slice(0, token.index) + sign + digit;
    } else {
      nextExpression += digit;
    }

    updateExpression(nextExpression);
    return;
  }

  const trimmed = state.expression.trimEnd();

  if (!trimmed) {
    updateExpression(digit);
    return;
  }

  if (trimmed.endsWith("%") || trimmed.endsWith(")")) {
    updateExpression(`${trimmed} × ${digit}`);
    return;
  }

  updateExpression(state.expression + digit);
}

function inputDecimal() {
  if (state.error) {
    resetCalculation();
  }

  if (state.justEvaluated) {
    resetCalculation();
  }

  const token = getTrailingNumber(state.expression);

  if (token) {
    if (token[0].includes(",") || /e/i.test(token[0])) {
      return;
    }

    updateExpression(`${state.expression},`);
    return;
  }

  const trimmed = state.expression.trimEnd();

  if (!trimmed) {
    updateExpression("0,");
    return;
  }

  if (trimmed.endsWith("%") || trimmed.endsWith(")")) {
    updateExpression(`${trimmed} × 0,`);
    return;
  }

  updateExpression(`${state.expression}0,`);
}

function inputOperator(operator) {
  if (state.error) {
    resetCalculation();
  }

  if (state.justEvaluated) {
    state.expression = toExpressionString(state.result ?? 0);
    state.lastExpression = "";
    state.result = null;
    state.justEvaluated = false;
  }

  let expression = state.expression.trimEnd();

  if (!expression) {
    if (operator === "−") {
      updateExpression("−");
    }
    return;
  }

  const lastCharacter = expression.at(-1);

  if (OPERATOR_PATTERN.test(lastCharacter)) {
    if (operator === "−" && lastCharacter !== "−") {
      updateExpression(`${expression} −`);
      return;
    }

    const base = expression.slice(0, -1).trimEnd();

    if (!base) {
      updateExpression(operator === "−" ? "−" : "");
      return;
    }

    updateExpression(`${base} ${operator} `);
    return;
  }

  if (expression.endsWith(",")) {
    expression = expression.slice(0, -1);
  }

  updateExpression(`${expression} ${operator} `);
}

function toggleSign() {
  if (state.error) {
    resetCalculation();
  }

  if (state.justEvaluated) {
    const value = -(state.result ?? 0);
    resetCalculation();
    state.expression = toExpressionString(value === 0 ? 0 : value);
    updateDisplay();
    return;
  }

  const expression = state.expression.trimEnd();

  if (!expression) {
    return;
  }

  const token = getTrailingNumber(expression);

  if (!token) {
    if (
      TRAILING_OPERATOR_PATTERN.test(expression) &&
      !/[−-]$/.test(expression)
    ) {
      updateExpression(`${expression} −`);
    }
    return;
  }

  const tokenText = token[0];
  const before = expression.slice(0, token.index);
  const replacement = /^[−-]/.test(tokenText)
    ? tokenText.slice(1)
    : `−${tokenText}`;

  updateExpression(before + replacement);
}

function inputPercent() {
  if (state.error) {
    resetCalculation();
  }

  if (state.justEvaluated) {
    state.expression = toExpressionString(state.result ?? 0);
    state.lastExpression = "";
    state.result = null;
    state.justEvaluated = false;
  }

  const expression = state.expression.trimEnd();

  if (!expression) {
    return;
  }

  if (
    TRAILING_OPERATOR_PATTERN.test(expression) ||
    expression.endsWith("(")
  ) {
    return;
  }

  const withoutComma = expression.endsWith(",")
    ? expression.slice(0, -1)
    : expression;

  updateExpression(`${withoutComma}%`);
}

function inputParenthesis(parenthesis) {
  if (state.error) {
    resetCalculation();
  }

  if (state.justEvaluated) {
    if (parenthesis === ")") {
      return;
    }

    resetCalculation();
  }

  const expression = state.expression;
  const trimmed = expression.trimEnd();

  if (parenthesis === "(") {
    if (!trimmed) {
      updateExpression("(");
      return;
    }

    if (/[\d%)]$/.test(trimmed)) {
      updateExpression(`${trimmed} × (`);
      return;
    }

    updateExpression(`${expression}(`);
    return;
  }

  const opened = (expression.match(/\(/g) || []).length;
  const closed = (expression.match(/\)/g) || []).length;

  if (opened <= closed || !trimmed) {
    return;
  }

  if (
    TRAILING_OPERATOR_PATTERN.test(trimmed) ||
    trimmed.endsWith("(") ||
    trimmed.endsWith(",")
  ) {
    return;
  }

  updateExpression(`${trimmed})`);
}

function backspace() {
  if (state.justEvaluated) {
    const previousExpression = state.lastExpression;
    resetCalculation();

    if (previousExpression) {
      state.expression = previousExpression;
    }

    updateDisplay();
    return;
  }

  if (state.error) {
    state.error = null;
  }

  const expression = state.expression.trimEnd();

  if (!expression) {
    updateDisplay();
    return;
  }

  if (TRAILING_OPERATOR_PATTERN.test(expression)) {
    updateExpression(expression.slice(0, -1).trimEnd());
    return;
  }

  updateExpression(expression.slice(0, -1).trimEnd());
}

function clearAll() {
  resetCalculation();
  updateDisplay();
}

function addHistory(expression, result) {
  state.history = [{ expression, result }, ...state.history].slice(
    0,
    MAX_HISTORY,
  );
  saveHistory();
  renderHistory();
}

function equals() {
  if (state.error || state.justEvaluated) {
    return;
  }

  let expression = state.expression.trim();

  while (TRAILING_OPERATOR_PATTERN.test(expression)) {
    expression = expression.slice(0, -1).trimEnd();
  }

  if (!expression) {
    return;
  }

  if (expression.endsWith(",")) {
    expression = expression.slice(0, -1);
  }

  try {
    const value = evaluate(expression);

    if (!isPlainNumber(expression)) {
      addHistory(expression, value);
    }

    state.expression = toExpressionString(value);
    state.lastExpression = expression;
    state.result = value;
    state.justEvaluated = true;
    state.error = null;
    updateDisplay({ commit: true });
    announce(`${expression} равно ${formatNumber(value)}`);
  } catch (error) {
    state.error =
      error instanceof CalcError ? error.message : "Не удалось посчитать";
    updateDisplay();
    shakeDisplay();
    announce(state.error);
  }
}

function resultSizeClass(text) {
  const length = text.length;

  if (length > 18) {
    return "xs";
  }

  if (length > 13) {
    return "sm";
  }

  if (length > 9) {
    return "md";
  }

  return "lg";
}

function updateDisplay({ commit = false } = {}) {
  clearTimeout(resultAnimationTimer);
  elements.result.classList.remove("is-error", "is-committed");
  elements.display.classList.toggle("has-error", Boolean(state.error));

  const expressionText = state.justEvaluated
    ? `${state.lastExpression} =`
    : state.expression.trim();

  elements.expression.textContent = expressionText;
  elements.expression.classList.toggle("is-empty", !expressionText);

  requestAnimationFrame(() => {
    elements.expression.scrollLeft = elements.expression.scrollWidth;
  });

  if (state.error) {
    elements.result.textContent = state.error;
    elements.result.dataset.size = resultSizeClass(state.error);
    elements.result.classList.add("is-error");
    elements.equalsMark.classList.remove("is-visible");
    return;
  }

  let value = null;

  if (state.justEvaluated) {
    value = state.result;
  } else if (state.expression.trim()) {
    value = preview(state.expression);
  }

  let displayText = "0";
  let showEquals = false;

  if (value !== null) {
    displayText = formatNumber(value);
    showEquals =
      state.justEvaluated || hasOperator(state.expression.trim());
  } else if (state.expression.trim()) {
    displayText = "…";
  }

  elements.result.textContent = displayText;
  elements.result.dataset.size = resultSizeClass(displayText);
  elements.equalsMark.classList.toggle("is-visible", showEquals);

  if (commit) {
    elements.result.classList.add("is-committed");
    resultAnimationTimer = window.setTimeout(() => {
      elements.result.classList.remove("is-committed");
    }, 320);
  }
}

function shakeDisplay() {
  elements.display.classList.remove("is-shaking");
  void elements.display.offsetWidth;
  elements.display.classList.add("is-shaking");
  window.setTimeout(() => {
    elements.display.classList.remove("is-shaking");
  }, 360);
}

function announce(message) {
  elements.announcer.textContent = "";

  window.setTimeout(() => {
    elements.announcer.textContent = message;
  }, 30);
}

function loadHistoryItem(item) {
  state.expression = toExpressionString(item.result);
  state.lastExpression = item.expression;
  state.result = item.result;
  state.justEvaluated = true;
  state.error = null;
  updateDisplay({ commit: true });
  closeHistory();
}

function renderHistory() {
  elements.historyList.replaceChildren();
  elements.clearHistory.disabled = state.history.length === 0;
  elements.historyEmpty.hidden = state.history.length > 0;

  for (const item of state.history) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "history-item";
    button.title = "Вернуться к этому результату";

    const expression = document.createElement("span");
    expression.className = "history-expression";
    expression.textContent = `${item.expression} =`;

    const result = document.createElement("span");
    result.className = "history-result";
    result.textContent = formatNumber(item.result);

    button.append(expression, result);
    button.addEventListener("click", () => loadHistoryItem(item));
    elements.historyList.append(button);
  }
}

function clearHistory() {
  if (state.history.length === 0) {
    return;
  }

  state.history = [];
  saveHistory();
  renderHistory();
}

function isMobileHistory() {
  return window.matchMedia("(max-width: 760px)").matches;
}

function openHistory() {
  if (!isMobileHistory()) {
    return;
  }

  elements.historyPanel.classList.add("is-open");
  elements.historyToggle.setAttribute("aria-expanded", "true");
  elements.historyPanel.removeAttribute("aria-hidden");
  elements.historyPanel.inert = false;
  document.body.classList.add("history-open");
  elements.historyClose.focus();
}

function closeHistory() {
  if (!isMobileHistory()) {
    return;
  }

  elements.historyPanel.classList.remove("is-open");
  elements.historyToggle.setAttribute("aria-expanded", "false");
  elements.historyPanel.setAttribute("aria-hidden", "true");
  elements.historyPanel.inert = true;
  document.body.classList.remove("history-open");
  elements.historyToggle.focus({ preventScroll: true });
}

function toggleHistory() {
  if (elements.historyPanel.classList.contains("is-open")) {
    closeHistory();
  } else {
    openHistory();
  }
}

function syncHistoryMode() {
  if (isMobileHistory()) {
    if (!elements.historyPanel.classList.contains("is-open")) {
      elements.historyPanel.setAttribute("aria-hidden", "true");
      elements.historyPanel.inert = true;
    }
  } else {
    elements.historyPanel.classList.remove("is-open");
    elements.historyPanel.removeAttribute("aria-hidden");
    elements.historyPanel.inert = false;
    elements.historyToggle.setAttribute("aria-expanded", "false");
    document.body.classList.remove("history-open");
  }
}

function flashButton(selector) {
  const button = document.querySelector(selector);
  if (!button) {
    return;
  }

  button.classList.add("is-active");
  window.setTimeout(() => button.classList.remove("is-active"), 120);
}

function handleKeyboard(event) {
  if (event.metaKey || event.ctrlKey || event.altKey) {
    return;
  }

  const key = event.key;
  const focusedControl = event.target.closest?.(
    "button, a, input, select, textarea",
  );

  if (key === "Enter" && focusedControl) {
    return;
  }

  if (key === "Escape") {
    if (elements.historyPanel.classList.contains("is-open")) {
      closeHistory();
      return;
    }

    event.preventDefault();
    clearAll();
    flashButton('[data-action="clear"]');
    return;
  }

  if (key === "Enter" || key === "=") {
    event.preventDefault();
    equals();
    flashButton('[data-action="equals"]');
    return;
  }

  if (key === "Backspace") {
    event.preventDefault();
    backspace();
    flashButton('[data-action="backspace"]');
    return;
  }

  if (key === "Delete") {
    event.preventDefault();
    clearAll();
    flashButton('[data-action="clear"]');
    return;
  }

  if (/^\d$/.test(key)) {
    event.preventDefault();
    inputDigit(key);
    flashButton(`[data-digit="${key}"]`);
    return;
  }

  if (key === "." || key === ",") {
    event.preventDefault();
    inputDecimal();
    flashButton('[data-action="decimal"]');
    return;
  }

  if (key === "(" || key === ")") {
    event.preventDefault();
    inputParenthesis(key);
    return;
  }

  if (key === "^") {
    event.preventDefault();
    inputOperator("^");
    return;
  }

  const operatorMap = {
    "+": "+",
    "-": "−",
    "*": "×",
    x: "×",
    X: "×",
    "х": "×",
    "/": "÷",
    ":": "÷",
  };

  if (operatorMap[key]) {
    event.preventDefault();
    inputOperator(operatorMap[key]);
    flashButton(`[data-op="${operatorMap[key]}"]`);
    return;
  }

  if (key === "%") {
    event.preventDefault();
    inputPercent();
    flashButton('[data-action="percent"]');
  }
}

function handleKeypadClick(event) {
  const button = event.target.closest("button");
  if (!button) {
    return;
  }

  if (button.dataset.digit) {
    inputDigit(button.dataset.digit);
  } else if (button.dataset.op) {
    inputOperator(button.dataset.op);
  } else {
    const action = button.dataset.action;

    if (action === "clear") {
      clearAll();
    } else if (action === "backspace") {
      backspace();
    } else if (action === "percent") {
      inputPercent();
    } else if (action === "sign") {
      toggleSign();
    } else if (action === "decimal") {
      inputDecimal();
    } else if (action === "equals") {
      equals();
    }
  }

  if (event.detail > 0) {
    button.blur();
  }
}

function setupEvents() {
  elements.keypad.addEventListener("click", handleKeypadClick);
  elements.themeToggle.addEventListener("click", toggleTheme);
  elements.historyToggle.addEventListener("click", toggleHistory);
  elements.historyClose.addEventListener("click", closeHistory);
  elements.clearHistory.addEventListener("click", clearHistory);
  document.addEventListener("keydown", handleKeyboard);

  const mobileQuery = window.matchMedia("(max-width: 760px)");
  mobileQuery.addEventListener("change", syncHistoryMode);

  document.addEventListener("click", (event) => {
    if (
      elements.historyPanel.classList.contains("is-open") &&
      !elements.historyPanel.contains(event.target) &&
      !elements.historyToggle.contains(event.target)
    ) {
      closeHistory();
    }
  });
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  const isLocalhost = ["localhost", "127.0.0.1"].includes(
    window.location.hostname,
  );

  if (window.location.protocol !== "https:" && !isLocalhost) {
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      // Офлайн-режим не-critical: интерфейс продолжает работать.
    });
  });
}

function init() {
  applyTheme(getInitialTheme());
  setupEvents();
  syncHistoryMode();
  renderHistory();
  updateDisplay();
  registerServiceWorker();
}

init();
