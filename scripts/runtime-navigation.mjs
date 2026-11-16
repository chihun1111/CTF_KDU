import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";

/**
 * Simulate a top-level navigation without following its redirect or retrying it.
 * Node fetch always sends Sec-Fetch-Mode: cors, even when navigate is supplied,
 * so it cannot exercise the browser navigation boundary on the one-use view.
 */
export async function requestNavigation(input, { headers: inputHeaders, signal, timeoutMs = 15_000 } = {}) {
  const url = new URL(input);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Navigation smoke checks require an HTTP(S) URL");
  }
  const headers = new Headers(inputHeaders);
  headers.set("sec-fetch-site", "same-origin");
  headers.set("sec-fetch-dest", "document");
  headers.set("sec-fetch-mode", "navigate");
  headers.set("accept-encoding", "identity");
  if (!headers.has("accept")) headers.set("accept", "text/html,application/xhtml+xml");
  const timeout = AbortSignal.timeout(timeoutMs);
  const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
  const send = url.protocol === "https:" ? httpsRequest : httpRequest;

  return new Promise((resolve, reject) => {
    const request = send(url, {
      method: "GET",
      agent: false,
      headers: Object.fromEntries(headers),
      signal: requestSignal,
    }, (incoming) => {
      const chunks = [];
      let byteLength = 0;
      incoming.on("data", (chunk) => {
        byteLength += chunk.length;
        if (byteLength > 1_048_576) {
          request.destroy(new Error("Navigation smoke response exceeds 1 MiB"));
          return;
        }
        chunks.push(chunk);
      });
      incoming.once("error", reject);
      incoming.once("aborted", () => reject(new Error("Navigation smoke response ended early")));
      incoming.once("end", () => {
        try {
          const responseHeaders = new Headers();
          for (let index = 0; index < incoming.rawHeaders.length; index += 2) {
            responseHeaders.append(incoming.rawHeaders[index], incoming.rawHeaders[index + 1]);
          }
          const status = incoming.statusCode ?? 502;
          const response = new Response([204, 205, 304].includes(status) ? null : Buffer.concat(chunks), {
            status,
            statusText: incoming.statusMessage,
            headers: responseHeaders,
          });
          Object.defineProperty(response, "url", { value: url.href });
          resolve(response);
        } catch (error) {
          reject(error);
        }
      });
    });
    request.once("error", reject);
    request.end();
  });
}
