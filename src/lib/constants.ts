export const SMS_CONSENT_VERSION = "2026-10-v1";
export const SMS_CONSENT_TEXT =
  "I agree to receive text messages from FleetGrid about available shifts at this number. Message frequency varies. Message and data rates may apply. Reply STOP to opt out, HELP for help.";
export const TOS_VERSION = "2026-10-v1"; // used in M2
export const ALLOWED_SUB_STATUSES = ["active", "trialing"] as const; // used in M2
export const BROADCAST_MAX_RECIPIENTS = 200; // used in M3
export const BROADCAST_SEND_CONCURRENCY = 10; // used in M3
export const OTP_RESEND_COOLDOWN_SECONDS = 60;
export const OTP_LENGTH = 6;
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const ALLOWED_UPLOAD_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;
export const IMAGE_MAX_DIMENSION = 2000;
export const IMAGE_TARGET_MAX_MB = 1;
export const DEFAULT_TIMEZONE = "America/Chicago";

export const SMS_PROGRAM_NAME = "FleetGrid Shift Alerts";
/** Replace once the client supplies the support email and phone (open question in the brief). */
export const SUPPORT_CONTACT_PLACEHOLDER = "support contact to be provided by FleetGrid.";

export const DOCUMENTS_BUCKET = "driver-documents";
export const SIGNED_URL_TTL_SECONDS = 60;

/** File extension stored in the bucket for each allowed mime type. */
export const MIME_EXTENSION: Record<(typeof ALLOWED_UPLOAD_MIME)[number], string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

export const SERVICE_RADIUS_MIN_MILES = 5;
export const SERVICE_RADIUS_MAX_MILES = 500;
export const SERVICE_RADIUS_DEFAULT_MILES = 50;
export const YEARS_EXPERIENCE_MAX = 60;
export const BIO_MAX_LENGTH = 500;
export const FULL_NAME_MAX_LENGTH = 100;
export const CERTIFICATION_MAX_LENGTH = 60;
export const CERTIFICATIONS_MAX_COUNT = 20;

export const US_STATES = [
  ["AL", "Alabama"],
  ["AK", "Alaska"],
  ["AZ", "Arizona"],
  ["AR", "Arkansas"],
  ["CA", "California"],
  ["CO", "Colorado"],
  ["CT", "Connecticut"],
  ["DE", "Delaware"],
  ["DC", "District of Columbia"],
  ["FL", "Florida"],
  ["GA", "Georgia"],
  ["HI", "Hawaii"],
  ["ID", "Idaho"],
  ["IL", "Illinois"],
  ["IN", "Indiana"],
  ["IA", "Iowa"],
  ["KS", "Kansas"],
  ["KY", "Kentucky"],
  ["LA", "Louisiana"],
  ["ME", "Maine"],
  ["MD", "Maryland"],
  ["MA", "Massachusetts"],
  ["MI", "Michigan"],
  ["MN", "Minnesota"],
  ["MS", "Mississippi"],
  ["MO", "Missouri"],
  ["MT", "Montana"],
  ["NE", "Nebraska"],
  ["NV", "Nevada"],
  ["NH", "New Hampshire"],
  ["NJ", "New Jersey"],
  ["NM", "New Mexico"],
  ["NY", "New York"],
  ["NC", "North Carolina"],
  ["ND", "North Dakota"],
  ["OH", "Ohio"],
  ["OK", "Oklahoma"],
  ["OR", "Oregon"],
  ["PA", "Pennsylvania"],
  ["RI", "Rhode Island"],
  ["SC", "South Carolina"],
  ["SD", "South Dakota"],
  ["TN", "Tennessee"],
  ["TX", "Texas"],
  ["UT", "Utah"],
  ["VT", "Vermont"],
  ["VA", "Virginia"],
  ["WA", "Washington"],
  ["WV", "West Virginia"],
  ["WI", "Wisconsin"],
  ["WY", "Wyoming"],
] as const;

export const US_STATE_CODES = US_STATES.map(([code]) => code);
