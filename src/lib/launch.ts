/**
 * Words about the launch area. FleetGrid goes live in the Houston area first; drivers
 * anywhere can sign up and are told when the launch has not reached them yet. The done
 * screen and the out-of-area sentences are the client's words (decisions of 2026-10-25).
 */

export const LAUNCH_AREA_NAME = "Houston";

/** One line on the landing page. */
export const LAUNCH_LINE = "Now launching in the Houston area.";

/** The info note under the ZIP field when the ZIP is outside every active area. */
export const OUT_OF_AREA_NOTE =
  "FleetGrid is launching in the Houston area first. You can still sign up. We'll text you when we launch near you.";

/** The done screen for a driver inside the launch area: the title, then the review line. */
export const DONE_TITLE = "You're in!";
export const DONE_TEXT =
  "Your profile is being reviewed for the Houston FleetGrid Network. Once approved, carriers can find you daily.";
/** Added to the review line only for drivers who said yes to shift texts. */
export const DONE_TEXT_SMS = "Keep an eye out for SMS shift alerts on your phone.";

/** The done screen for a driver outside every active area. */
export const OUT_OF_AREA_DONE_TITLE = "You're on the list.";
export const OUT_OF_AREA_DONE_TEXT =
  "FleetGrid isn't in your area yet. We've saved your profile and will let you know when we launch near you.";

/** The profile badge and the sentence under it, the same words as the done screen. */
export const OUT_OF_AREA_BADGE = "Outside launch area";
export const OUT_OF_AREA_PROFILE_TEXT = OUT_OF_AREA_DONE_TEXT;
