import process from "node:process";

process.stdin.setEncoding("utf8");
let input = "";
let pending = null;

function finish(value) {
  const resolve = pending.resolve;
  pending = null;
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
  process.stdout.write("\n");
  resolve(value);
}

process.stdin.on("data", (chunk) => {
  if (!process.stdin.isTTY) {
    input += chunk;
    if (pending) {
      const end = input.indexOf("\n");
      if (end >= 0) {
        const answer = input.slice(0, end).replace(/\r$/, "");
        input = input.slice(end + 1);
        finish(answer);
      }
    }
    return;
  }
  for (const char of chunk) {
    if (!pending) continue;
    if (char === "\u0003") process.exit(130);
    if (char === "\r" || char === "\n") {
      finish(pending.value);
      return;
    }
    if (char === "\u007f" || char === "\b") {
      pending.value = pending.value.slice(0, -1);
      if (!pending.hidden) process.stdout.write("\b \b");
    } else if (char >= " ") {
      pending.value += char;
      if (!pending.hidden) process.stdout.write(char);
    }
  }
});

export function prompt(text, { hidden = false } = {}) {
  process.stdout.write(text);
  if (!process.stdin.isTTY && hidden) process.stdout.write("(stdin is not interactive; input may be visible) ");
  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  process.stdin.resume();
  return new Promise((resolve) => {
    pending = { resolve, value: "", hidden };
    if (!process.stdin.isTTY) {
      const end = input.indexOf("\n");
      if (end >= 0) {
        const answer = input.slice(0, end).replace(/\r$/, "");
        input = input.slice(end + 1);
        finish(answer);
      }
    }
  });
}
