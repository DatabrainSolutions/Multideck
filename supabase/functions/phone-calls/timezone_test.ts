import { dateKeyInTimeZone, localDateBoundary } from "./core.ts";

Deno.test("uses the tenant timezone for summer reporting boundaries", () => {
  if (
    localDateBoundary("2026-08-22", "Europe/London") !==
      "2026-08-21T23:00:00.000Z"
  ) throw new Error("London summer start boundary should use BST");
  if (
    localDateBoundary("2026-08-22", "Europe/London", true) !==
      "2026-08-22T22:59:59.999Z"
  ) throw new Error("London summer end boundary should use BST");
});

Deno.test("re-evaluates the offset across a daylight-saving transition", () => {
  if (
    localDateBoundary("2026-03-29", "Europe/London") !==
      "2026-03-29T00:00:00.000Z"
  ) throw new Error("DST transition day should begin in GMT");
  if (
    localDateBoundary("2026-03-29", "Europe/London", true) !==
      "2026-03-29T22:59:59.999Z"
  ) throw new Error("DST transition day should end in BST");
});

Deno.test("groups trend points by the tenant-local calendar day", () => {
  const key = dateKeyInTimeZone(
    "2026-08-22T23:30:00.000Z",
    "Europe/London",
  );
  if (key !== "2026-08-23") {
    throw new Error(`Expected next London day, received ${key}`);
  }
});

Deno.test("fails closed for an invalid timezone", () => {
  if (localDateBoundary("2026-08-22", "Not/A_Timezone") !== null) {
    throw new Error("Invalid timezone should not create a misleading boundary");
  }
  if (dateKeyInTimeZone("2026-08-22T12:00:00Z", "Not/A_Timezone") !== "") {
    throw new Error("Invalid timezone should not create a trend key");
  }
});
