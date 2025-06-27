import { decode as decodeHTML, encode as encodeHTML } from "html-entities";
import { marked } from "marked";
import { evaluate } from "mathjs";

export const handler = async (req, res) => {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method Not Allowed. Use POST." });
    }

    const { operationGroup, operation, value, options = {} } = req.body || {};

    if (!operationGroup || !operation) {
      return res
        .status(400)
        .json({ error: 'Missing "operationGroup" or "operation".' });
    }

    const input = String(value);

    // ===== TEXT OPERATIONS =====
    const textFormatters = {
      uppercase: () => input.toUpperCase(),
      lowercase: () => input.toLowerCase(),
      capitalize: () =>
        input.charAt(0).toUpperCase() + input.slice(1).toLowerCase(),
      titlecase: () =>
        input.replace(
          /\w\S*/g,
          (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
        ),
      trim: () => input.trim(),
      removeWhitespace: () => input.replace(/\s+/g, ""),
      replace: () => {
        const { find, replaceWith } = options;
        if (typeof find !== "string" || typeof replaceWith !== "string") {
          throw new Error('"replace" needs "find" and "replaceWith".');
        }
        return input.split(find).join(replaceWith);
      },
      slugify: () =>
        input
          .toLowerCase()
          .replace(/[^\w\s-]/g, "")
          .trim()
          .replace(/[\s_-]+/g, "-"),
      split: () => input.split(options.delimiter ?? ","),
      substring: () => {
        const start = parseInt(options.start ?? 0);
        const end = parseInt(options.end ?? input.length);
        return input.substring(start, end);
      },
      length: () => input.length,
      startsWith: () => input.startsWith(options.prefix ?? ""),
      endsWith: () => input.endsWith(options.suffix ?? ""),
      contains: () => input.includes(options.text ?? ""),
      base64encode: () => Buffer.from(input).toString("base64"),
      base64decode: () => Buffer.from(input, "base64").toString("utf8"),
      reverse: () => [...input].reverse().join(""),
      repeat: () => {
        const times = parseInt(options.times ?? 1);
        return input.repeat(times);
      },
      url_encode: () => encodeURIComponent(input),
      url_decode: () => decodeURIComponent(input),
      word_count: () => input.trim().split(/\s+/).length,
      truncate: () => {
        const length = parseInt(options.length ?? 10);
        return input.length <= length
          ? input
          : input.substring(0, length) + "...";
      },
      encode_ascii: () => input.replace(/[^\x00-\x7F]/g, ""),
      default_value: () =>
        input && input.trim() !== "" ? input : options.default ?? "",
      email_extract: () =>
        (input.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,}/) ?? [""])[0],
      phone_extract: () =>
        (input.match(
          /(?:\+?(\d{1,3}))?[\s.-]?(\(?\d{3}\)?[\s.-]?)?\d{3}[\s.-]?\d{4}/
        ) ?? [""])[0],
      url_extract: () => (input.match(/https?:\/\/[^\s]+/g) ?? [""])[0],
      number_extract: () => {
        const match = input.match(/-?\d+(\.\d+)?/);
        return match ? parseFloat(match[0]) : null;
      },
      re_extract: () => {
        if (!options.pattern)
          throw new Error('"re_extract" requires a "pattern".');
        const regex = new RegExp(options.pattern, options.flags || "");
        const match = input.match(regex);
        return match ? match[0] : "";
      },
      htmlmarkdown: async () => {
        const { default: TurndownService } = await import("turndown");
        const service = new TurndownService();
        return service.turndown(input);
      },
      markdown: () => marked.parse(input),
      strip_html: () => input.replace(/<[^>]+>/g, ""),
      pluralize: async () => {
        const { default: pluralize } = await import("pluralize");
        return pluralize(input);
      },
      find: () => input.indexOf(options.text),
      spreadsheet_formula: () => {
        throw new Error('"spreadsheet_formula" is not supported in text.');
      },
      split_into_chunks: () => {
        const size = parseInt(options.size ?? 1000);
        return input.match(new RegExp(`.{1,${size}}`, "g")) || [];
      },
      superhero: () => {
        const adj = ["Incredible", "Amazing", "Mighty", "Fantastic"];
        const noun = ["Falcon", "Panther", "Wizard", "Knight"];
        return `${adj[Math.floor(Math.random() * adj.length)]} ${
          noun[Math.floor(Math.random() * noun.length)]
        }`;
      },
    };

    // ===== NUMBER OPERATIONS =====
    const numberFormatters = {
      currency: () => {
        if (typeof value !== "number")
          throw new Error('"value" must be a number.');
        const { locale = "en-US", currency = "USD" } = options;
        return new Intl.NumberFormat(locale, {
          style: "currency",
          currency,
        }).format(value);
      },
      formatting: () => {
        if (typeof value !== "number")
          throw new Error('"value" must be a number.');
        const {
          locale = "en-US",
          minimumFractionDigits = 0,
          maximumFractionDigits = 2,
        } = options;
        return new Intl.NumberFormat(locale, {
          minimumFractionDigits,
          maximumFractionDigits,
        }).format(value);
      },
      phone_v2: () => {
        const str = String(value).replace(/\D/g, "");
        if (str.length === 10)
          return `(${str.slice(0, 3)}) ${str.slice(3, 6)}-${str.slice(6)}`;
        if (str.length === 11 && str[0] === "1")
          return `+1 (${str.slice(1, 4)}) ${str.slice(4, 7)}-${str.slice(7)}`;
        throw new Error("Invalid phone number.");
      },
      math_v2: () => {
        const num = parseFloat(options.operand ?? 0);
        switch (options.operator) {
          case "add":
            return value + num;
          case "subtract":
            return value - num;
          case "multiply":
            return value * num;
          case "divide":
            return num === 0 ? "NaN" : value / num;
          case "modulo":
            return value % num;
          case "power":
            return Math.pow(value, num);
          default:
            throw new Error(`Unsupported operator: ${options.operator}`);
        }
      },
      random_number: () => {
        const min = parseFloat(options.min ?? 0);
        const max = parseFloat(options.max ?? 100);
        return Math.random() * (max - min) + min;
      },
      spreadsheet_formula: () => {
        const formula = (options.formula || "").trim();
        const variables = options.variables || {};

        if (!formula || typeof formula !== "string") {
          throw new Error(
            '"spreadsheet_formula" requires a string in options.formula'
          );
        }

        const cleaned = formula.startsWith("=") ? formula.slice(1) : formula;

        try {
          return evaluate(cleaned, variables);
        } catch (e) {
          throw new Error(`Invalid formula: ${e.message}`);
        }
      },
    };

    // ===== DATE OPERATIONS =====
    const dateFormatters = {
      formatting: () => {
        const date = new Date(value);
        if (isNaN(date)) throw new Error("Invalid date.");
        const { locale = "en-US", options: formatOptions = {} } = options;
        return new Intl.DateTimeFormat(locale, formatOptions).format(date);
      },
      compare_dates: () => {
        const date1 = new Date(value);
        const date2 = new Date(options.compareWith);
        if (isNaN(date1) || isNaN(date2)) throw new Error("Invalid date(s).");
        return date1.getTime() - date2.getTime();
      },
      manipulate: () => {
        const date = new Date(value);
        if (isNaN(date)) throw new Error("Invalid date.");
        const { amount = 0, unit = "days" } = options;
        const units = {
          days: 86400000,
          hours: 3600000,
          minutes: 60000,
          seconds: 1000,
        };
        return new Date(
          date.getTime() + amount * (units[unit] || 0)
        ).toISOString();
      },
    };

    // ===== BOOLEAN OPERATIONS =====
    const toBool = (val) => {
      if (typeof val === "boolean") return val;
      if (typeof val === "string")
        return ["true", "1", "yes"].includes(val.toLowerCase());
      if (typeof val === "number") return val !== 0;
      return Boolean(val);
    };

    const booleanFormatters = {
      not: () => !toBool(value),

      and: () => {
        const values = options.values ?? [];
        if (!Array.isArray(values)) {
          throw new Error('"values" must be an array for "and" operation.');
        }
        return [value, ...values].every(toBool);
      },

      or: () => {
        const values = options.values ?? [];
        if (!Array.isArray(values)) {
          throw new Error('"values" must be an array for "or" operation.');
        }
        return [value, ...values].some(toBool);
      },

      xor: () => {
        const val1 = toBool(value);
        const val2 = toBool(options.other);
        return (val1 || val2) && !(val1 && val2);
      },

      if_else: () => {
        return toBool(value) ? options.then : options.otherwise;
      },

      default_value: () => {
        return typeof value === "boolean" ? value : options.default ?? false;
      },

      // Retain your previous helpers
      invert: () => !value,
      toString: () => String(value),
      toNumber: () => (value ? 1 : 0),
    };

    // Choose formatter map
    const groupMap = {
      text: textFormatters,
      number: numberFormatters,
      date: dateFormatters,
      boolean: booleanFormatters,
    };

    const formatterGroup = groupMap[operationGroup];
    if (!formatterGroup) {
      return res
        .status(400)
        .json({ error: `Unsupported operationGroup: ${operationGroup}` });
    }

    const formatter = formatterGroup[operation];
    if (!formatter) {
      return res
        .status(400)
        .json({ error: `Unsupported operation: ${operation}` });
    }

    const result = await formatter();
    return res.status(200).json({ result });
  } catch (err) {
    console.error("Formatter Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
};
