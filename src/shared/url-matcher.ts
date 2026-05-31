/**
 * Normalizes a URL by removing trailing slashes and query parameters.
 */
export function normalizeUrl(u: string): string {
	if (!u) return "";
	return u.trim().toLowerCase().replace(/\/$/, "").split("?")[0];
}

/**
 * Checks if a current URL matches a schema's URL or urlPattern (supports glob wildcards).
 */
export function matchUrl(
	schemaUrl: string,
	urlPattern: string | undefined,
	currentUrl: string,
): boolean {
	if (!currentUrl) return false;

	const normCurrent = normalizeUrl(currentUrl);
	const normSchema = normalizeUrl(schemaUrl);

	// 1. Exact or normalized matching
	if (normCurrent === normSchema) return true;

	// 2. Simple glob pattern matching if urlPattern is defined
	const pattern = urlPattern || schemaUrl;
	if (pattern) {
		// Convert simple glob pattern (e.g., https://*.example.com/*) to a regex
		// Escape regex special chars except *
		const escaped = pattern
			.trim()
			.toLowerCase()
			.replace(/[.+^${}()|[\]\\]/g, "\\$&") // escape regex chars
			.replace(/\*/g, ".*"); // replace glob * with regex .*

		try {
			const regex = new RegExp(`^${escaped}$`);
			if (regex.test(currentUrl) || regex.test(normCurrent)) {
				return true;
			}
		} catch (_e) {
			// Fallback if RegExp is invalid
		}
	}

	return false;
}
