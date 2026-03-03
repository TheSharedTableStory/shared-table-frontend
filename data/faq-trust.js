// Trust FAQ subset and placement matrix.
// Pure data module: no window/global attachments.

const FAQ_TRUST_CONFIG = {
  trustFaqIds: ["T01", "T02", "T03", "T04", "T05", "T06"],
  contextPlacement: {
    checkout: ["T01", "T02", "T03", "T06"],
    experience: ["T01", "T02", "T03", "T04", "T05"],
    host_onboarding: ["T02", "T03", "T04", "T06"],
    before_you_book: ["T01", "T02", "T03", "T04", "T05", "T06"],
    first_time_host: ["T02", "T03", "T04", "T06"],
    dashboard_guest: ["G01", "G03", "G08", "G09", "G11", "G13", "G14"],
    dashboard_host: ["H03", "H05", "H07", "H08", "H11", "H14"],
    about_platform: ["P01", "P02", "P03", "P04", "P05", "P06", "P07", "P08", "P09"],
    about_trust: ["T01", "T02", "T03", "T04", "T05", "T06"]
  },
  escalation: {
    manageBookingsUrl: "my-bookings.html",
    reportIssueUrl: "report.html",
    contactSupportHref: "mailto:Contact@thesharedtablestory.com"
  }
};

function __deepFreezeTrust(value) {
  if (!value || typeof value !== "object") return value;
  if (Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.keys(value).forEach((key) => {
    __deepFreezeTrust(value[key]);
  });
  return value;
}

__deepFreezeTrust(FAQ_TRUST_CONFIG);
