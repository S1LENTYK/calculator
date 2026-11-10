const MAX_SIGNIFICANT_DIGITS = 12;

export class CalcError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "CalcError";
    this.code = code;
  }
}

export function tokenize(source) {
  const text = String(source)
    .replace(/×/g, "*")
    .replace(/÷/g, "/")
    .replace(/[−–—]/g, "-")
    .replace(/,/g, ".")
    .replace(/\s+/g, "");

  const tokens = [];
  let index = 0;

  while (index < text.length) {
    const char = text[index];

    if (/[0-9.]/.test(char)) {
      const match = text
        .slice(index)
        .match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/);

      if (!match) {
        throw new CalcError("SYNTAX", "Проверьте выражение");
      }

      const value = Number(match[0]);
      if (!Number.isFinite(value)) {
        throw new CalcError("OVERFLOW", "Слишком большое число");
      }

      tokens.push({ type: "number", value });
      index += match[0].length;
      continue;
    }

    if ("+-*/^%()".includes(char)) {
      tokens.push({ type: char });
      index += 1;
      continue;
    }

    throw new CalcError("UNKNOWN", `Недопустимый символ «${char}»`);
  }

  return tokens;
}

function parseTokens(tokens) {
  let position = 0;

  const peek = () => tokens[position];
  const syntaxError = () => new CalcError("SYNTAX", "Проверьте выражение");

  function parseExpression() {
    let node = parseTerm();

    while (peek()?.type === "+" || peek()?.type === "-") {
      const op = tokens[position++].type;
      const right = parseTerm();
      node = { type: "binary", op, left: node, right };
    }

    return node;
  }

  function parseTerm() {
    let node = parseUnary();

    while (peek()?.type === "*" || peek()?.type === "/") {
      const op = tokens[position++].type;
      const right = parseUnary();
      node = { type: "binary", op, left: node, right };
    }

    return node;
  }

  function parseUnary() {
    const token = peek();

    if (token?.type === "+") {
      position += 1;
      return parseUnary();
    }

    if (token?.type === "-") {
      position += 1;
      return { type: "unary", op: "-", operand: parseUnary() };
    }

    return parsePower();
  }

  function parsePower() {
    const base = parsePostfix();

    if (peek()?.type === "^") {
      position += 1;
      return { type: "binary", op: "^", left: base, right: parseUnary() };
    }

    return base;
  }

  function parsePostfix() {
    let node = parsePrimary();

    while (peek()?.type === "%") {
      position += 1;
      node = { type: "percent", operand: node };
    }

    return node;
  }

  function parsePrimary() {
    const token = peek();

    if (!token) {
      throw syntaxError();
    }

    if (token.type === "number") {
      position += 1;
      return { type: "number", value: token.value };
    }

    if (token.type === "(") {
      position += 1;
      const node = parseExpression();

      if (peek()?.type !== ")") {
        throw new CalcError("UNCLOSED", "Не хватает скобки");
      }

      position += 1;
      return node;
    }

    throw syntaxError();
  }

  if (tokens.length === 0) {
    throw new CalcError("EMPTY", "Введите выражение");
  }

  const ast = parseExpression();

  if (position !== tokens.length) {
    throw syntaxError();
  }

  return ast;
}

function isPercentNode(node) {
  return node?.type === "percent";
}

function evaluateNode(node) {
  switch (node.type) {
    case "number":
      return node.value;

    case "unary":
      return -evaluateNode(node.operand);

    case "percent":
      return evaluateNode(node.operand) / 100;

    case "binary": {
      if (node.op === "+" || node.op === "-") {
        const left = evaluateNode(node.left);
        const right = isPercentNode(node.right)
          ? left * (evaluateNode(node.right.operand) / 100)
          : evaluateNode(node.right);

        return node.op === "+" ? left + right : left - right;
      }

      const left = evaluateNode(node.left);
      const right = evaluateNode(node.right);

      if (node.op === "*") {
        return left * right;
      }

      if (node.op === "/") {
        if (right === 0) {
          throw new CalcError("DIV_ZERO", "Деление на ноль");
        }
        return left / right;
      }

      return Math.pow(left, right);
    }

    default:
      throw new CalcError("SYNTAX", "Проверьте выражение");
  }
}

export function evaluate(expression) {
  const tokens = tokenize(expression);
  const ast = parseTokens(tokens);
  const value = evaluateNode(ast);

  if (!Number.isFinite(value)) {
    throw new CalcError("OVERFLOW", "Слишком большое число");
  }

  if (value === 0) {
    return 0;
  }

  return Number(value.toPrecision(MAX_SIGNIFICANT_DIGITS));
}

export function isPlainNumber(expression) {
  return /^[−-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:e[+-]?\d+)?$/i.test(
    String(expression).trim(),
  );
}

export function preview(expression) {
  let candidate = String(expression).trimEnd();

  while (/[+\-*/^×÷−]$/.test(candidate)) {
    candidate = candidate.slice(0, -1).trimEnd();
  }

  if (!candidate) {
    return null;
  }

  try {
    return evaluate(candidate);
  } catch {
    return null;
  }
}

export function toExpressionString(value) {
  const normalized = Object.is(value, -0) ? 0 : value;
  return String(normalized).replace(".", ",").replace(/^-/, "−");
}

export function formatNumber(value) {
  if (!Number.isFinite(value)) {
    return "Ошибка";
  }

  if (value === 0) {
    return "0";
  }

  const absolute = Math.abs(value);

  if (absolute >= 1e15 || absolute < 1e-9) {
    const [rawMantissa, rawExponent] = value.toExponential(8).split("e");
    const mantissa = rawMantissa
      .replace(/(\.\d*?)0+$/, "$1")
      .replace(/\.$/, "");
    const exponent = Number(rawExponent);

    return `${mantissa.replace(".", ",")}e${exponent >= 0 ? "+" : ""}${exponent}`;
  }

  return new Intl.NumberFormat("ru-RU", {
    maximumSignificantDigits: MAX_SIGNIFICANT_DIGITS,
    useGrouping: true,
  }).format(value);
}
