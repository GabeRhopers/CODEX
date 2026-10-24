import { PUBLISHED_GAMES_DIR } from "./gameBundle";

/**
 * The GitHub page that uploads a game file into the folder the site serves it
 * from.
 *
 * Publishing is "put this file in `public/games/`" (see `PublishScene`), and
 * for a long time the screen simply said so. Saying it is not the same as
 * being able to do it: an author had to find the repository, find the folder,
 * and — the part nothing warned about — be on the right branch. GitHub's own
 * "Add file → Upload files" page can be opened straight onto a directory, so
 * the instruction can be a link instead of a sentence.
 *
 * **Derived from where the editor is, not hardcoded**, for the same reason
 * `publishedGameLink` is: this is one deployment of a project that could be
 * deployed elsewhere, and a baked-in owner and repository would be wrong for
 * anyone else and silently wrong here if the site ever moves.
 */

/**
 * The branch the upload lands on, and the single most important string here.
 *
 * `.github/workflows/deploy-pages.yml` builds every pushed branch but deploys
 * only `main`, so a file uploaded anywhere else is committed, visible on
 * GitHub, and never served. **`main` is not this repository's default branch**
 * (it was `claude/thextech-engine-install-rt70v8` when this was written), which
 * is exactly the trap: the web UI opens on the default, so an author following
 * the old written instruction would upload successfully to a branch that never
 * publishes and get a link that never comes alive, with nothing anywhere
 * explaining why.
 */
const DEPLOY_BRANCH = "main";

const PAGES_HOST_SUFFIX = ".github.io";

/**
 * Where to upload a game file, or `null` when this page is not a GitHub Pages
 * site and there is nothing to point at.
 *
 * Null is the ordinary answer on a dev server and on localhost, where the
 * author is not publishing anything — the caller draws no button rather than
 * one that goes somewhere wrong. That is also why this returns a link instead
 * of throwing: "there is no such page" is a normal state, not a failure.
 *
 * Both shapes of Pages site are handled. A *project* site
 * (`owner.github.io/repo/`) takes its repository from the first path segment; a
 * *user* site (`owner.github.io/`) is served from a repository named after the
 * host itself, which is the one case where the repo name is not in the path.
 */
export function gamesUploadLink(href: string): string | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (!host.endsWith(PAGES_HOST_SUFFIX)) return null;

  const owner = host.slice(0, -PAGES_HOST_SUFFIX.length);
  if (!owner) return null;

  const firstSegment = url.pathname.split("/").filter(Boolean)[0];
  const repo = firstSegment ?? host;
  return `https://github.com/${owner}/${repo}/upload/${DEPLOY_BRANCH}/public/${PUBLISHED_GAMES_DIR}`;
}
