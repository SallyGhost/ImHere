import { execFileSync } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { hashPassword } from "./src/services/authService.js";

const backend = process.cwd();
const varsPath = join(backend, ".dev.vars");
const wranglerCli = join(backend, "node_modules", "wrangler", "bin", "wrangler.js");
const sqlFile = join(tmpdir(), `imhere-local-admin-${randomUUID()}.sql`);

function sqlValue(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

const rl = createInterface({ input: stdin, output: stdout });
try {
  const username = (await rl.question("Логін локального адміністратора: ")).trim().toLowerCase();
  const password = await rl.question("Пароль (від 6 символів, латиниця): ");
  if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username)) {
    throw new Error("Логін має містити 3–32 латинські літери, цифри, крапки, дефіси або підкреслення.");
  }
  if (password.length < 6 || password.length > 128 || !/^[\x21-\x7E]+$/.test(password)) {
    throw new Error("Пароль має містити від 6 до 128 латинських символів, цифр або знаків пунктуації без пробілів.");
  }

  const vars = await readFile(varsPath, "utf8");
  const pepper = vars.split(/\r?\n/).find((line) => line.startsWith("AUTH_PEPPER="))?.slice("AUTH_PEPPER=".length);
  if (!pepper || pepper.length < 32) {
    throw new Error("Задайте AUTH_PEPPER завдовжки щонайменше 32 символи у backend/.dev.vars.");
  }

  const id = randomUUID();
  const email = `${username}@accounts.imhere.invalid`;
  const passwordHash = await hashPassword(password, pepper);
  const sql = `INSERT INTO users (id, email, username, password_hash, role, approval_status, is_admin) VALUES (${sqlValue(id)}, ${sqlValue(email)}, ${sqlValue(username)}, ${sqlValue(passwordHash)}, 'teacher', 'approved', 1);`;
  await writeFile(sqlFile, sql, "utf8");
  execFileSync(process.execPath, [wranglerCli, "d1", "execute", "imhere-db", "--local", `--file=${sqlFile}`], {
    cwd: backend,
    stdio: "inherit",
  });
  stdout.write(`Локальний обліковий запис адміністратора створено: ${username}\n`);
} finally {
  rl.close();
  await rm(sqlFile, { force: true });
}
