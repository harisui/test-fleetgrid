/**
 * The words a driver agrees to and the one-time link's rules (Milestone 6, part 1). No server
 * imports: the checkbox shows the same statement that is stored with the acceptance.
 */

/** The driver's checkbox, at sign-up, on the Terms page and on the link page. Stored word for word. */
export const DRIVER_TERMS_STATEMENT =
  "I have read and agree to the FleetGrid Terms of Service and Privacy Policy.";

/** The carrier's checkbox on the carrier Terms page. Stored word for word. */
export const CARRIER_TERMS_STATEMENT =
  "I have read and agree to the FleetGrid Terms of Service and Privacy Policy on behalf of my company.";

/** Shown when the box is left unticked. */
export const DRIVER_TERMS_MESSAGE = "Tick the box to accept the Terms of Service";

/** The button on the Terms page and the link page. */
export const ACCEPT_TERMS_LABEL = "Accept the Terms";

/** How long a one-time link works. */
export const TERMS_LINK_DAYS = 14;

/** The link page lives at /t/<token>; the token is 16 random bytes, base64url (22 characters). */
export const TERMS_LINK_PREFIX = "/t";
export const TERMS_TOKEN_PATTERN = /^[A-Za-z0-9_-]{22}$/;
