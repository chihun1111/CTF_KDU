import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import type { ArtifactFileReader, ArtifactFileWriter } from "./challenge-artifact.service.js";

const DEFAULT_ARTIFACT_ROOT = "/app/artifacts";

function resolveArtifactPath(root: string, artifactPath: string): string {
  const rootPath = resolve(root);
  const candidate = artifactPath.startsWith("/") ? resolve(artifactPath) : resolve(rootPath, artifactPath);
  const rootRelativePath = relative(rootPath, candidate);

  if (rootRelativePath.startsWith("..") || isAbsolute(rootRelativePath)) {
    throw new Error("Artifact path escapes artifact root");
  }

  return candidate;
}

export class LocalArtifactFileReader implements ArtifactFileReader, ArtifactFileWriter {
  constructor(private readonly artifactRoot = process.env.ARTIFACT_ROOT?.trim() || DEFAULT_ARTIFACT_ROOT) {}

  async readArtifact(artifactPath: string): Promise<Buffer> {
    return readFile(resolveArtifactPath(this.artifactRoot, artifactPath));
  }

  async writeArtifact(artifactPath: string, body: Buffer): Promise<void> {
    const fullPath = resolveArtifactPath(this.artifactRoot, artifactPath);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, body, { flag: "wx" }).catch(async (error: NodeJS.ErrnoException) => {
      if (error.code !== "EEXIST") {
        throw error;
      }
    });
  }
}
