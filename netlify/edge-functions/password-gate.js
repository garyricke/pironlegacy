/**
 * Site-wide HTTP Basic Auth — temporary, until we go public again.
 *
 * Runs at the edge on every request (see [[edge_functions]] in netlify.toml),
 * so nothing is served without the password: HTML, the one-sheet PDF, images,
 * and the /api/* functions all return 401 first. Unlike the in-page JS gate,
 * this is what actually keeps the site out of search results — a crawler gets
 * 401 and has no content to index.
 *
 * Username is ignored; only the password is checked. The password is not a
 * secret worth hiding here — it is already in plain text in index.html — so it
 * stays hardcoded rather than becoming a Netlify env var, which would trip
 * secret scanning by matching the "piron" substring all over the build output.
 *
 * To go public: delete the [[edge_functions]] block in netlify.toml (this file
 * can stay, dormant, for next time).
 */

const PASSWORD = "piron";
// Header values must be ASCII: an em dash here throws when the Response is built.
const REALM = "Dennis Piron Legacy Scholarship - private preview";

export default async (request) => {
  const [scheme, encoded] = (request.headers.get("authorization") || "").split(" ");

  if (scheme === "Basic" && encoded) {
    let decoded = "";
    try {
      decoded = atob(encoded);
    } catch {
      decoded = "";
    }
    const separator = decoded.indexOf(":");
    if (separator !== -1 && decoded.slice(separator + 1) === PASSWORD) {
      return; // authorized — fall through to the static asset or function
    }
  }

  return new Response("Authentication required.", {
    status: 401,
    headers: {
      "WWW-Authenticate": `Basic realm="${REALM}", charset="UTF-8"`,
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
};
