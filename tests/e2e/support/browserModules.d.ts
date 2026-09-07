/**
 * The `/src/…` specifiers the specs import *inside the browser*.
 *
 * Several specs reach into the app's own modules from within `page.evaluate`,
 * to seed or read storage without clicking through ten screens first:
 *
 *     const mod = (await import("/src/skins/skinStorage.ts")) as { … };
 *
 * That string is a **Vite dev-server URL**, resolved by the browser at run time
 * against the page's origin — not a path TypeScript can or should follow from
 * Node. Without this declaration `tsc` reports fifteen "Cannot find module"
 * errors that are all false, and the noise is enough to make turning the check
 * on at all feel not worth it. Which is presumably part of why it was never on:
 * until 2026-09-07 `tsconfig.json` said `"include": ["src"]`, so no file under
 * tests/ had ever been typechecked.
 *
 * Shorthand (no body), so the import resolves to `any`. That is the honest
 * type: nothing here knows what the dev server will hand back. It costs
 * nothing, because every call site already casts the result to the exact shape
 * it needs — `as { savePixelSkin(...): Promise<...> }` and so on — which is
 * where the real type safety lives and where a drift from the app's actual API
 * would show up.
 *
 * Deliberately narrow: only `/src/*` is declared, so a genuine typo in an
 * ordinary relative import still fails the way it should.
 */
declare module "/src/*";
