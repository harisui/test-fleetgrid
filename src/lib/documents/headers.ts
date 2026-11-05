/** On every response that serves or links a driver document: never indexed, never cached. */
export const DOCUMENT_RESPONSE_HEADERS = {
  "X-Robots-Tag": "noindex, nofollow",
  "Cache-Control": "no-store",
} as const;

/** The pages and routes that can carry a document or a signed link to one. */
const DOCUMENT_PATHS = [/^\/admin(\/|$)/, /^\/carrier\/shifts(\/|$)/, /^\/driver\/documents(\/|$)/, /^\/api\/documents\//, /^\/api\/admin\/documents\//];

export const carriesDocuments = (pathname: string): boolean => DOCUMENT_PATHS.some((path) => path.test(pathname));

/** A redirect to a signed link, with the headers above. */
export function documentRedirect(url: string): Response {
  return new Response(null, { status: 302, headers: { Location: url, ...DOCUMENT_RESPONSE_HEADERS } });
}
