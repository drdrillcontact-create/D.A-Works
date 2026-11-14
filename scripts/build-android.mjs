import { spawn } from "node:child_process";
import { chmodSync } from "node:fs";
import path from "node:path";

const isWindows = process.platform === "win32";
const androidDir = path.resolve(process.cwd(), "android");
const wrapper = path.join(androidDir, isWindows ? "gradlew.bat" : "gradlew");

// Git checkouts on some filesystems drop the wrapper's executable bit, which
// makes "./gradlew" fail with EACCES before Gradle even starts.
if (!isWindows) {
  try {
    chmodSync(wrapper, 0o755);
  } catch {
    // Read-only checkout: fall through and let the spawn report the real error.
  }
}

const child = spawn(isWindows ? "gradlew.bat" : wrapper, ["assembleDebug", "--no-daemon", "--stacktrace"], {
  cwd: androidDir,
  stdio: "inherit",
  shell: isWindows
});

child.on("error", (error) => {
  console.error(`Could not start the Android Gradle wrapper: ${error.message}`);
  console.error("Check that JDK 21 and the Android SDK are installed and JAVA_HOME / ANDROID_HOME are set.");
  process.exitCode = 1;
});
child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`Android build stopped by signal ${signal}.`);
    process.exitCode = 1;
    return;
  }
  if (code === 0) {
    console.log("\nAPK: android/app/build/outputs/apk/debug/app-debug.apk");
  }
  process.exitCode = code ?? 1;
});
