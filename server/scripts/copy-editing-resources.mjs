import fs from "node:fs";
fs.cpSync(
  new URL("../src/prompts/editing/", import.meta.url),
  new URL("../dist/prompts/editing/", import.meta.url),
  { recursive: true },
);
