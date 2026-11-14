import { spawn } from "node:child_process";
import path from "node:path";

const isWindows = process.platform === "win32";
const gradleCommand = isWindows ? "gradlew.bat" : "./gradlew";
const child = spawn(gradleCommand, ["assembleDebug", "--no-daemon"], {
  cwd: path.resolve(process.cwd(), "android"),
  stdio: "inherit",
  shell: isWindows
});

child.on("error", (error) => {
  console.error(`Could not start the Android Gradle wrapper: ${error.message}`);
  process.exitCode = 1;
});
child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`Android build stopped by signal ${signal}.`);
    process.exitCode = 1;
    return;
  }
  process.exitCode = code ?? 1;
});
