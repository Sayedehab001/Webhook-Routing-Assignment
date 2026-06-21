import type { RawApplicationPayload, ValidatedApplication } from "./types";

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  data?: ValidatedApplication;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validatePayload(raw: RawApplicationPayload): ValidationResult {
  const errors: string[] = [];

  const application_id = typeof raw.application_id === "string" ? raw.application_id.trim() : "";
  if (!application_id) errors.push("application_id is required and must be a non-empty string");

  const business_name = typeof raw.business_name === "string" ? raw.business_name.trim() : "";
  if (!business_name) errors.push("business_name is required and must be a non-empty string");

  const contact_email = typeof raw.contact_email === "string" ? raw.contact_email.trim() : "";
  if (!contact_email) {
    errors.push("contact_email is required");
  } else if (!EMAIL_RE.test(contact_email)) {
    errors.push("contact_email does not look like a valid email address");
  }

  let monthly_orders = NaN;
  if (typeof raw.monthly_orders === "number") {
    monthly_orders = raw.monthly_orders;
  } else if (typeof raw.monthly_orders === "string" && raw.monthly_orders.trim() !== "") {
    monthly_orders = Number(raw.monthly_orders);
  }
  if (!Number.isFinite(monthly_orders) || monthly_orders < 0) {
    errors.push("monthly_orders is required and must be a number >= 0");
  }

  const submitted_at = typeof raw.submitted_at === "string" ? raw.submitted_at.trim() : "";
  if (!submitted_at || Number.isNaN(Date.parse(submitted_at))) {
    errors.push("submitted_at is required and must be a parseable ISO 8601 timestamp");
  }

  const country_raw =
    typeof raw.country === "string" && raw.country.trim() !== "" ? raw.country.trim() : null;
  const region_hint =
    typeof raw.region === "string" && raw.region.trim() !== "" ? raw.region.trim() : null;
  const phone = typeof raw.phone === "string" && raw.phone.trim() !== "" ? raw.phone.trim() : null;
  const body_text = typeof raw.body === "string" && raw.body.trim() !== "" ? raw.body.trim() : null;

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    errors: [],
    data: {
      application_id,
      business_name,
      contact_email,
      body_text,
      country_raw,
      region_hint,
      phone,
      monthly_orders,
      submitted_at,
    },
  };
}
