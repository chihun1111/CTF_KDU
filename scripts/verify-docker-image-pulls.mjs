import { spawn } from "node:child_process";

const DEFAULT_IMAGES = ["node:24-bookworm-slim", "nginx:1.27-alpine", "postgres:17-alpine", "redis:7.4-alpine"];

function parseArgs(argv) {
  const options = {
    images: [],
    timeoutMs: 15000,
    printImages: false,
  };
  const failures = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--image") {
      const value = argv[index + 1];
      if (!value) {
        failures.push("--image requires a value");
        continue;
      }
      options.images.push(value);
      index += 1;
      continue;
    }
    if (arg === "--timeout-ms") {
      const value = Number(argv[index + 1]);
      if (!Number.isInteger(value) || value <= 0) {
        failures.push("--timeout-ms requires a positive integer");
        continue;
      }
      options.timeoutMs = value;
      index += 1;
      continue;
    }
    if (arg === "--print-images") {
      options.printImages = true;
      continue;
    }
    failures.push(`Unknown argument: ${arg}`);
  }
  if (failures.length > 0) {
    throw new Error(failures.join("\n"));
  }
  if (options.images.length === 0) {
    options.images = DEFAULT_IMAGES;
  }
  return options;
}

function pullImage(image, timeoutMs) {
  return new Promise((resolve) => {
    const fakeCommand = process.env.DOCKER_PULL_COMMAND;
    const child = fakeCommand
      ? spawn(`${fakeCommand} ${image}`, { shell: true, stdio: "pipe" })
      : spawn("docker", ["pull", image], { stdio: "pipe" });
    let output = "";
    let settled = false;
    function finish(result) {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve(result);
    }
    const timer = setTimeout(() => {
      child.stdout?.destroy();
      child.stderr?.destroy();
      child.kill("SIGKILL");
      child.unref();
      finish({ image, ok: false, message: `Timed out pulling ${image} after ${timeoutMs}ms`, output });
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.on("error", (error) => {
      finish({ image, ok: false, message: `${image}: ${error.message}`, output });
    });
    child.on("close", (code) => {
      if (code === 0) {
        finish({ image, ok: true, message: `Pulled ${image}`, output });
        return;
      }
      finish({ image, ok: false, message: `Failed pulling ${image} with exit code ${code ?? "unknown"}`, output });
    });
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.printImages) {
    console.log(JSON.stringify(DEFAULT_IMAGES, null, 2));
    return;
  }

  const failures = [];
  for (const image of options.images) {
    const result = await pullImage(image, options.timeoutMs);
    if (result.ok) {
      console.log(`[docker-images] ${result.message}`);
      continue;
    }
    failures.push(result.message);
    if (result.output.trim()) {
      console.error(result.output.trim());
    }
  }

  if (failures.length > 0) {
    console.error("Docker image pull verification failed:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log("Docker image pull verification passed.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
