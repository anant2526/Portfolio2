import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * The Twin Studio writes files into your project (avatar, .env.local), so it
 * only exists while you run `npm run dev` on your own machine.
 */
export const studioEnabled = () => process.env.NODE_ENV === "development";

export const notAvailable = () =>
  Response.json({ error: "The Twin Studio only runs locally (npm run dev)." }, { status: 404 });

// The ignore hint stops Turbopack from tracing (and deploying) the whole project for this dev-only helper.
export const projectPath = (...parts: string[]) => path.join(/*turbopackIgnore: true*/ process.cwd(), ...parts);

/** Sets (or adds) KEY=value lines in .env.local and in the running process. */
export async function setEnvVars(vars: Record<string, string>) {
  const file = projectPath(".env.local");
  let text = "";
  try {
    text = await readFile(file, "utf8");
  } catch {
    // no .env.local yet
  }
  for (const [key, value] of Object.entries(vars)) {
    if (!/^[A-Za-z0-9_\-.]+$/.test(value)) throw new Error(`Refusing to write an unexpected value for ${key}.`);
    const line = `${key}=${value}`;
    const re = new RegExp(`^\\s*#?\\s*${key}=.*$`, "m");
    text = re.test(text) ? text.replace(re, line) : `${text}${text && !text.endsWith("\n") ? "\n" : ""}${line}\n`;
    process.env[key] = value;
  }
  await writeFile(file, text, "utf8");
}
