// FAQ catalog for The Shared Table Story website.
// Pure data module: no window/global attachments.

const FAQ_CATALOG = [
  {
    id: "T01",
    hub: "trust",
    section: "payments",
    question: "When am I charged, and is payment secure?",
    answer:
      "You are charged during the booking confirmation process. Payments are handled through secure provider workflows designed to protect transaction data.",
    answerMode: "deterministic",
    requiredInputs: [],
    sourceRefs: [
      { type: "route", method: "POST", path: "/api/bookings/:bookingId/payment-intent" },
      { type: "page", path: "experience.html", anchor: "booking-form" },
      { type: "policy", id: "active_policy", anchor: "payments" }
    ],
    contexts: ["contextual", "experience", "checkout", "host_onboarding"],
    trustSurface: true,
    status: "active",
    version: "2026-02-22.1",
    effectiveDate: "2026-02-22",
    lastReviewed: "2026-02-22"
  },
  {
    id: "T02",
    hub: "trust",
    section: "cancellation",
    question: "Can I cancel, and what decides my refund?",
    answer:
      "You can cancel according to the cancellation policy attached to your booking. Refund outcomes depend on timing and the policy snapshot captured at confirmation.",
    answerMode: "policy_bound",
    requiredInputs: [],
    sourceRefs: [
      { type: "route", method: "POST", path: "/api/bookings/:id/cancel" },
      { type: "route", method: "GET", path: "/api/policy/active" },
      { type: "page", path: "policy.html", anchor: "cancellation" }
    ],
    contexts: ["contextual", "experience", "checkout", "host_onboarding"],
    trustSurface: true,
    status: "active",
    version: "2026-02-22.1",
    effectiveDate: "2026-02-22",
    lastReviewed: "2026-02-22"
  },
  {
    id: "T03",
    hub: "trust",
    section: "host-cancellation",
    question: "What happens if the host cancels?",
    answer:
      "If a host cancels a confirmed booking, eligible payments are refunded according to the host-cancellation rules.",
    answerMode: "policy_bound",
    requiredInputs: [],
    sourceRefs: [
      { type: "route", method: "GET", path: "/api/policy/active" },
      { type: "page", path: "policy.html", anchor: "host-cancellation" }
    ],
    contexts: ["contextual", "experience", "checkout", "host_onboarding"],
    trustSurface: true,
    status: "active",
    version: "2026-02-22.1",
    effectiveDate: "2026-02-22",
    lastReviewed: "2026-02-22"
  },
  {
    id: "T04",
    hub: "trust",
    section: "disputes",
    question: "How do disputes or reports work?",
    answer:
      "You can submit a report from your booking page with details and supporting information. Cases are reviewed and resolved through a structured process.",
    answerMode: "deterministic",
    requiredInputs: [],
    sourceRefs: [
      { type: "route", method: "POST", path: "/api/bookings/:id/complaint" },
      { type: "route", method: "POST", path: "/api/moderation/report" },
      { type: "page", path: "report.html", anchor: "report-form" },
      { type: "page", path: "my-bookings.html", anchor: "complaint" }
    ],
    contexts: ["contextual", "experience", "checkout", "host_onboarding"],
    trustSurface: true,
    status: "active",
    version: "2026-02-22.1",
    effectiveDate: "2026-02-22",
    lastReviewed: "2026-02-22"
  },
  {
    id: "T05",
    hub: "trust",
    section: "location-privacy",
    question: "When will I receive the exact location details?",
    answer:
      "Location details are shared after booking confirmation to balance host privacy with attendance readiness.",
    answerMode: "policy_bound",
    requiredInputs: [],
    sourceRefs: [
      { type: "page", path: "success.html", anchor: "booking-summary-card" },
      { type: "page", path: "policy.html", anchor: "privacy" }
    ],
    contexts: ["contextual", "experience", "checkout", "host_onboarding"],
    trustSurface: true,
    status: "active",
    version: "2026-02-22.1",
    effectiveDate: "2026-02-22",
    lastReviewed: "2026-02-22"
  },
  {
    id: "T06",
    hub: "trust",
    section: "refund-timing",
    question: "How long do refunds take?",
    answer:
      "Refund timing depends on approval status and payment provider processing timelines after a refund is initiated.",
    answerMode: "conditional",
    requiredInputs: ["refund_decision_status", "payment_provider_processing_time"],
    sourceRefs: [
      { type: "route", method: "POST", path: "/api/bookings/:id/cancel" },
      { type: "page", path: "policy.html", anchor: "refunds" }
    ],
    contexts: ["contextual", "experience", "checkout", "host_onboarding"],
    trustSurface: true,
    status: "active",
    version: "2026-02-22.1",
    effectiveDate: "2026-02-22",
    lastReviewed: "2026-02-22"
  },
  {
    id: "G01",
    hub: "guest",
    section: "booking",
    question: "How do I book an experience?",
    answer: "Choose a session, confirm guest details, complete payment, and receive booking confirmation.",
    answerMode: "deterministic",
    requiredInputs: [],
    sourceRefs: [
      { type: "route", method: "POST", path: "/api/experiences/:id/book" },
      { type: "route", method: "POST", path: "/api/bookings/verify" },
      { type: "page", path: "experience.html", anchor: "booking-form" }
    ],
    contexts: ["hub", "before_you_book"],
    trustSurface: false,
    status: "active",
    version: "2026-02-22.1",
    effectiveDate: "2026-02-22",
    lastReviewed: "2026-02-22"
  },
  {
    id: "G02",
    hub: "guest",
    section: "booking",
    question: "Do I need an account to book?",
    answer:
      "Yes. An account is required to confirm bookings, receive updates, and manage your reservations.",
    answerMode: "deterministic",
    requiredInputs: [],
    sourceRefs: [
      { type: "route", method: "POST", path: "/api/experiences/:id/book" },
      { type: "page", path: "login.html", anchor: "auth" },
      { type: "page", path: "my-bookings.html", anchor: "bookings" }
    ],
    contexts: ["hub", "before_you_book"],
    trustSurface: false,
    status: "active",
    version: "2026-02-22.1",
    effectiveDate: "2026-02-22",
    lastReviewed: "2026-02-22"
  },
  {
    id: "G03",
    hub: "guest",
    section: "booking",
    question: "How do I know my booking is confirmed?",
    answer:
      "Confirmation appears after successful payment and is available in your booking details.",
    answerMode: "deterministic",
    requiredInputs: [],
    sourceRefs: [
      { type: "route", method: "POST", path: "/api/bookings/verify" },
      { type: "route", method: "GET", path: "/api/bookings/my-bookings" },
      { type: "page", path: "success.html", anchor: "success-state" }
    ],
    contexts: ["hub", "before_you_book"],
    trustSurface: false,
    status: "active",
    version: "2026-02-22.1",
    effectiveDate: "2026-02-22",
    lastReviewed: "2026-02-22"
  },
  {
    id: "G04",
    hub: "guest",
    section: "booking",
    question: "Can I book for multiple guests?",
    answer: "Yes, if capacity is available for your selected session.",
    answerMode: "deterministic",
    requiredInputs: [],
    sourceRefs: [
      { type: "route", method: "POST", path: "/api/experiences/:id/book" },
      { type: "page", path: "experience.html", anchor: "guest-count" }
    ],
    contexts: ["hub", "before_you_book"],
    trustSurface: false,
    status: "active",
    version: "2026-02-22.1",
    effectiveDate: "2026-02-22",
    lastReviewed: "2026-02-22"
  },
  {
    id: "G05",
    hub: "guest",
    section: "payments",
    question: "When will I be charged?",
    answer: "Payment is captured during the booking confirmation process.",
    answerMode: "deterministic",
    requiredInputs: [],
    sourceRefs: [
      { type: "route", method: "POST", path: "/api/bookings/:bookingId/payment-intent" },
      { type: "route", method: "POST", path: "/api/bookings/verify" },
      { type: "page", path: "experience.html", anchor: "booking-form" }
    ],
    contexts: ["hub", "before_you_book", "checkout"],
    trustSurface: false,
    status: "active",
    version: "2026-02-22.1",
    effectiveDate: "2026-02-22",
    lastReviewed: "2026-02-22"
  },
  {
    id: "G06",
    hub: "guest",
    section: "payments",
    question: "Are fees shown before I confirm?",
    answer: "Yes. The price breakdown, including any fees, is shown before final confirmation.",
    answerMode: "deterministic",
    requiredInputs: [],
    sourceRefs: [
      { type: "route", method: "POST", path: "/api/experiences/:id/book" },
      { type: "page", path: "experience.html", anchor: "price-breakdown" },
      { type: "policy", id: "active_policy", anchor: "fees" }
    ],
    contexts: ["hub", "before_you_book", "checkout"],
    trustSurface: false,
    status: "active",
    version: "2026-02-22.1",
    effectiveDate: "2026-02-22",
    lastReviewed: "2026-02-22"
  },
  {
    id: "G07",
    hub: "guest",
    section: "payments",
    question: "Can I apply a discount or promo code?",
    answer: "Valid promotion codes can be applied during checkout when eligible.",
    answerMode: "deterministic",
    requiredInputs: [],
    sourceRefs: [
      { type: "route", method: "POST", path: "/api/experiences/:id/book" },
      { type: "page", path: "experience.html", anchor: "promo-code" }
    ],
    contexts: ["hub", "before_you_book", "checkout"],
    trustSurface: false,
    status: "active",
    version: "2026-02-22.1",
    effectiveDate: "2026-02-22",
    lastReviewed: "2026-02-22"
  },
  {
    id: "G08",
    hub: "guest",
    section: "cancellation",
    question: "Can I cancel my booking?",
    answer: "Yes, cancellation options depend on the policy attached to your booking.",
    answerMode: "policy_bound",
    requiredInputs: [],
    sourceRefs: [
      { type: "route", method: "POST", path: "/api/bookings/:id/cancel" },
      { type: "route", method: "GET", path: "/api/policy/active" },
      { type: "page", path: "policy.html", anchor: "cancellation" }
    ],
    contexts: ["hub", "before_you_book", "checkout"],
    trustSurface: false,
    status: "active",
    version: "2026-02-22.1",
    effectiveDate: "2026-02-22",
    lastReviewed: "2026-02-22"
  },
  {
    id: "G09",
    hub: "guest",
    section: "cancellation",
    question: "Will I get a refund if I cancel?",
    answer: "Refund eligibility and amount depend on cancellation timing and policy tiers.",
    answerMode: "policy_bound",
    requiredInputs: [],
    sourceRefs: [
      { type: "route", method: "GET", path: "/api/policy/active" },
      { type: "page", path: "policy.html", anchor: "refunds" }
    ],
    contexts: ["hub", "before_you_book", "checkout"],
    trustSurface: false,
    status: "active",
    version: "2026-02-22.1",
    effectiveDate: "2026-02-22",
    lastReviewed: "2026-02-22"
  },
  {
    id: "G10",
    hub: "guest",
    section: "cancellation",
    question: "What happens if the host cancels?",
    answer: "Eligible paid bookings are refunded according to host-cancellation rules.",
    answerMode: "policy_bound",
    requiredInputs: [],
    sourceRefs: [
      { type: "route", method: "GET", path: "/api/policy/active" },
      { type: "page", path: "policy.html", anchor: "host-cancellation" }
    ],
    contexts: ["hub", "before_you_book", "checkout"],
    trustSurface: false,
    status: "active",
    version: "2026-02-22.1",
    effectiveDate: "2026-02-22",
    lastReviewed: "2026-02-22"
  },
  {
    id: "G11",
    hub: "guest",
    section: "safety",
    question: "How do I report a problem or safety concern?",
    answer: "Use the reporting option in your booking details and provide relevant information.",
    answerMode: "deterministic",
    requiredInputs: [],
    sourceRefs: [
      { type: "route", method: "POST", path: "/api/bookings/:id/complaint" },
      { type: "route", method: "POST", path: "/api/moderation/report" },
      { type: "page", path: "report.html", anchor: "report-form" }
    ],
    contexts: ["hub", "before_you_book", "checkout"],
    trustSurface: false,
    status: "active",
    version: "2026-02-22.1",
    effectiveDate: "2026-02-22",
    lastReviewed: "2026-02-22"
  },
  {
    id: "G12",
    hub: "guest",
    section: "before-attending",
    question: "When will I receive the location details?",
    answer: "Location details are released after confirmation to support privacy and preparation.",
    answerMode: "policy_bound",
    requiredInputs: [],
    sourceRefs: [
      { type: "page", path: "success.html", anchor: "booking-summary-card" },
      { type: "page", path: "policy.html", anchor: "privacy" }
    ],
    contexts: ["hub", "before_you_book", "checkout"],
    trustSurface: false,
    status: "active",
    version: "2026-02-22.1",
    effectiveDate: "2026-02-22",
    lastReviewed: "2026-02-22"
  },
  {
    id: "G13",
    hub: "guest",
    section: "support",
    question: "How do I contact support?",
    answer:
      "You can contact support through the FAQs page or reporting tools linked to your booking.",
    answerMode: "policy_bound",
    requiredInputs: [],
    sourceRefs: [
      { type: "page", path: "help-center.html", anchor: "help-root" },
      { type: "page", path: "report.html", anchor: "report-form" },
      { type: "page", path: "policy.html", anchor: "support" }
    ],
    contexts: ["hub", "before_you_book"],
    trustSurface: false,
    status: "active",
    version: "2026-02-22.1",
    effectiveDate: "2026-02-22",
    lastReviewed: "2026-02-22"
  },
  {
    id: "G14",
    hub: "guest",
    section: "before-attending",
    question: "Can I contact the host after booking?",
    answer: "Messaging is available through the platform when enabled for your booking.",
    answerMode: "conditional",
    requiredInputs: ["booking_state", "messaging_enabled"],
    sourceRefs: [
      { type: "route", method: "GET", path: "/api/bookings/my-bookings" },
      { type: "page", path: "my-bookings.html", anchor: "booking-list" },
      { type: "policy", id: "active_policy", anchor: "communications" }
    ],
    contexts: ["hub", "before_you_book"],
    trustSurface: false,
    status: "active",
    version: "2026-02-22.1",
    effectiveDate: "2026-02-22",
    lastReviewed: "2026-02-22"
  },
  {
    id: "H01",
    hub: "host",
    section: "onboarding",
    question: "Who can become a host?",
    answer:
      "Individuals who can provide safe, clearly described experiences aligned with platform requirements may apply.",
    answerMode: "policy_bound",
    requiredInputs: [],
    sourceRefs: [
      { type: "route", method: "POST", path: "/api/host/applications" },
      { type: "page", path: "host-terms.html", anchor: "eligibility" }
    ],
    contexts: ["hub", "first_time_host"],
    trustSurface: false,
    status: "active",
    version: "2026-02-22.1",
    effectiveDate: "2026-02-22",
    lastReviewed: "2026-02-22"
  },
  {
    id: "H02",
    hub: "host",
    section: "onboarding",
    question: "How does experience approval work?",
    answer: "Submissions are reviewed for clarity, accuracy, and safety before going live.",
    answerMode: "policy_bound",
    requiredInputs: [],
    sourceRefs: [
      { type: "route", method: "POST", path: "/api/experiences" },
      { type: "route", method: "PATCH", path: "/api/admin/experiences/:id/lifecycle" },
      { type: "page", path: "host.html", anchor: "create-experience-form" }
    ],
    contexts: ["hub", "first_time_host", "host_onboarding"],
    trustSurface: false,
    status: "active",
    version: "2026-02-22.1",
    effectiveDate: "2026-02-22",
    lastReviewed: "2026-02-22"
  },
  {
    id: "H03",
    hub: "host",
    section: "listing",
    question: "How do I create an experience?",
    answer: "Use the host creation flow to define format, schedule, capacity, and details.",
    answerMode: "deterministic",
    requiredInputs: [],
    sourceRefs: [
      { type: "route", method: "POST", path: "/api/experiences" },
      { type: "page", path: "host.html", anchor: "create-experience-form" }
    ],
    contexts: ["hub", "first_time_host", "host_onboarding"],
    trustSurface: false,
    status: "active",
    version: "2026-02-22.1",
    effectiveDate: "2026-02-22",
    lastReviewed: "2026-02-22"
  },
  {
    id: "H04",
    hub: "host",
    section: "listing",
    question: "Can I edit an experience after publishing?",
    answer: "Some fields remain editable, depending on booking status and policy constraints.",
    answerMode: "conditional",
    requiredInputs: ["booking_state", "policy_constraints"],
    sourceRefs: [
      { type: "route", method: "PUT", path: "/api/experiences/:id" },
      { type: "page", path: "host.html", anchor: "my-listings-section" },
      { type: "policy", id: "active_policy", anchor: "listing-updates" }
    ],
    contexts: ["hub", "first_time_host"],
    trustSurface: false,
    status: "active",
    version: "2026-02-22.1",
    effectiveDate: "2026-02-22",
    lastReviewed: "2026-02-22"
  },
  {
    id: "H05",
    hub: "host",
    section: "booking-management",
    question: "How do bookings appear, and how do I manage them?",
    answer: "Bookings appear in host tools where you can view details, communicate, and manage sessions.",
    answerMode: "deterministic",
    requiredInputs: [],
    sourceRefs: [
      { type: "route", method: "GET", path: "/api/bookings/host-bookings" },
      { type: "route", method: "GET", path: "/api/host/bookings/:experienceId" },
      { type: "page", path: "host.html", anchor: "my-listings-section" }
    ],
    contexts: ["hub", "first_time_host"],
    trustSurface: false,
    status: "active",
    version: "2026-02-22.1",
    effectiveDate: "2026-02-22",
    lastReviewed: "2026-02-22"
  },
  {
    id: "H06",
    hub: "host",
    section: "booking-management",
    question: "Can I message guests?",
    answer: "Yes, messaging is available through platform communication tools.",
    answerMode: "deterministic",
    requiredInputs: [],
    sourceRefs: [
      { type: "route", method: "GET", path: "/api/host/bookings/:experienceId" },
      { type: "page", path: "my-bookings.html", anchor: "reply" },
      { type: "policy", id: "active_policy", anchor: "communications" }
    ],
    contexts: ["hub", "first_time_host"],
    trustSurface: false,
    status: "active",
    version: "2026-02-22.1",
    effectiveDate: "2026-02-22",
    lastReviewed: "2026-02-22"
  },
  {
    id: "H07",
    hub: "host",
    section: "cancellation",
    question: "Can I cancel a session, and what happens if I do?",
    answer: "Hosts can cancel sessions, but cancellation consequences apply under policy.",
    answerMode: "policy_bound",
    requiredInputs: [],
    sourceRefs: [
      { type: "route", method: "PATCH", path: "/api/experiences/:id/status" },
      { type: "route", method: "GET", path: "/api/policy/active" },
      { type: "page", path: "policy.html", anchor: "host-cancellation" }
    ],
    contexts: ["hub", "first_time_host", "host_onboarding"],
    trustSurface: false,
    status: "active",
    version: "2026-02-22.1",
    effectiveDate: "2026-02-22",
    lastReviewed: "2026-02-22"
  },
  {
    id: "H08",
    hub: "host",
    section: "earnings",
    question: "How do payouts work?",
    answer: "Payouts are calculated from completed paid bookings after fees and policy outcomes.",
    answerMode: "deterministic",
    requiredInputs: [],
    sourceRefs: [
      { type: "route", method: "GET", path: "/api/host/earnings" },
      { type: "page", path: "host.html", anchor: "pricing-transparency-panel" }
    ],
    contexts: ["hub", "first_time_host", "host_onboarding"],
    trustSurface: false,
    status: "active",
    version: "2026-02-22.1",
    effectiveDate: "2026-02-22",
    lastReviewed: "2026-02-22"
  },
  {
    id: "H09",
    hub: "host",
    section: "earnings",
    question: "When will I receive payouts?",
    answer:
      "Payout timing depends on completion status, complaint windows, and payout release rules.",
    answerMode: "deterministic",
    requiredInputs: [],
    sourceRefs: [
      { type: "route", method: "GET", path: "/api/host/earnings" },
      { type: "page", path: "policy.html", anchor: "payouts" }
    ],
    contexts: ["hub", "first_time_host", "host_onboarding"],
    trustSurface: false,
    status: "active",
    version: "2026-02-22.1",
    effectiveDate: "2026-02-22",
    lastReviewed: "2026-02-22"
  },
  {
    id: "H10",
    hub: "host",
    section: "earnings",
    question: "What fees apply and where do I see them?",
    answer: "Fee details are visible in earnings breakdown and policy information.",
    answerMode: "policy_bound",
    requiredInputs: [],
    sourceRefs: [
      { type: "route", method: "GET", path: "/api/host/earnings" },
      { type: "page", path: "policy.html", anchor: "fees" }
    ],
    contexts: ["hub", "first_time_host", "host_onboarding"],
    trustSurface: false,
    status: "active",
    version: "2026-02-22.1",
    effectiveDate: "2026-02-22",
    lastReviewed: "2026-02-22"
  },
  {
    id: "H11",
    hub: "host",
    section: "earnings",
    question: "How do refunds affect my earnings?",
    answer: "Approved refunds adjust the related booking earnings according to policy and payment state.",
    answerMode: "deterministic",
    requiredInputs: [],
    sourceRefs: [
      { type: "route", method: "GET", path: "/api/host/earnings" },
      { type: "route", method: "POST", path: "/api/bookings/:id/cancel" },
      { type: "page", path: "policy.html", anchor: "refunds" }
    ],
    contexts: ["hub", "first_time_host", "host_onboarding"],
    trustSurface: false,
    status: "active",
    version: "2026-02-22.1",
    effectiveDate: "2026-02-22",
    lastReviewed: "2026-02-22"
  },
  {
    id: "H12",
    hub: "host",
    section: "safety",
    question: "What safety expectations apply to hosts?",
    answer:
      "Hosts must deliver experiences safely and follow platform guidelines and applicable obligations.",
    answerMode: "policy_bound",
    requiredInputs: [],
    sourceRefs: [
      { type: "page", path: "host-terms.html", anchor: "safety" },
      { type: "page", path: "terms.html", anchor: "conduct" }
    ],
    contexts: ["hub", "first_time_host", "host_onboarding"],
    trustSurface: false,
    status: "active",
    version: "2026-02-22.1",
    effectiveDate: "2026-02-22",
    lastReviewed: "2026-02-22"
  },
  {
    id: "H13",
    hub: "host",
    section: "disputes",
    question: "How do complaints or disputes work for hosts?",
    answer:
      "Complaints are reviewed using submitted information and booking records to determine outcomes.",
    answerMode: "policy_bound",
    requiredInputs: [],
    sourceRefs: [
      { type: "route", method: "POST", path: "/api/bookings/:id/complaint" },
      { type: "page", path: "policy.html", anchor: "disputes" }
    ],
    contexts: ["hub", "first_time_host", "host_onboarding"],
    trustSurface: false,
    status: "active",
    version: "2026-02-22.1",
    effectiveDate: "2026-02-22",
    lastReviewed: "2026-02-22"
  },
  {
    id: "H14",
    hub: "host",
    section: "safety",
    question: "How do I report an incident?",
    answer: "Use reporting tools promptly and include clear details and evidence when available.",
    answerMode: "deterministic",
    requiredInputs: [],
    sourceRefs: [
      { type: "route", method: "POST", path: "/api/moderation/report" },
      { type: "page", path: "report.html", anchor: "report-form" }
    ],
    contexts: ["hub", "first_time_host", "host_onboarding"],
    trustSurface: false,
    status: "active",
    version: "2026-02-22.1",
    effectiveDate: "2026-02-22",
    lastReviewed: "2026-02-22"
  },
  {
    id: "P01",
    hub: "platform",
    section: "basics",
    question: "What is The Shared Table Story?",
    answer:
      "The Shared Table Story connects guests with hosts offering small-group, host-led experiences.",
    answerMode: "policy_bound",
    requiredInputs: [],
    sourceRefs: [
      { type: "page", path: "about.html", anchor: "about" },
      { type: "page", path: "terms.html", anchor: "definitions" }
    ],
    contexts: ["hub"],
    trustSurface: false,
    status: "active",
    version: "2026-02-22.1",
    effectiveDate: "2026-02-22",
    lastReviewed: "2026-02-22"
  },
  {
    id: "P02",
    hub: "platform",
    section: "booking-lifecycle",
    question: "How does booking work from start to finish?",
    answer:
      "Guests discover experiences, select sessions, confirm payment, attend, and leave feedback.",
    answerMode: "deterministic",
    requiredInputs: [],
    sourceRefs: [
      { type: "route", method: "POST", path: "/api/experiences/:id/book" },
      { type: "route", method: "POST", path: "/api/bookings/verify" },
      { type: "route", method: "POST", path: "/api/reviews" },
      { type: "page", path: "experience.html", anchor: "booking-form" }
    ],
    contexts: ["hub"],
    trustSurface: false,
    status: "active",
    version: "2026-02-22.1",
    effectiveDate: "2026-02-22",
    lastReviewed: "2026-02-22"
  },
  {
    id: "P03",
    hub: "platform",
    section: "booking-lifecycle",
    question: "When is a booking considered confirmed?",
    answer: "A booking is confirmed after successful payment verification completes.",
    answerMode: "deterministic",
    requiredInputs: [],
    sourceRefs: [
      { type: "route", method: "POST", path: "/api/bookings/verify" },
      { type: "route", method: "POST", path: "/api/stripe/webhook" },
      { type: "page", path: "success.html", anchor: "success-state" }
    ],
    contexts: ["hub"],
    trustSurface: false,
    status: "active",
    version: "2026-02-22.1",
    effectiveDate: "2026-02-22",
    lastReviewed: "2026-02-22"
  },
  {
    id: "P04",
    hub: "platform",
    section: "roles",
    question: "What does the platform handle versus what hosts handle?",
    answer:
      "The platform facilitates discovery, payments, and trust processes, while hosts deliver the experience.",
    answerMode: "policy_bound",
    requiredInputs: [],
    sourceRefs: [
      { type: "page", path: "terms.html", anchor: "operator-role" },
      { type: "page", path: "policy.html", anchor: "responsibility" }
    ],
    contexts: ["hub"],
    trustSurface: false,
    status: "active",
    version: "2026-02-22.1",
    effectiveDate: "2026-02-22",
    lastReviewed: "2026-02-22"
  },
  {
    id: "P05",
    hub: "platform",
    section: "payments",
    question: "How are payments processed?",
    answer: "Payments are processed through integrated provider workflows linked to booking records.",
    answerMode: "deterministic",
    requiredInputs: [],
    sourceRefs: [
      { type: "route", method: "POST", path: "/api/bookings/:bookingId/payment-intent" },
      { type: "route", method: "POST", path: "/api/stripe/webhook" },
      { type: "page", path: "policy.html", anchor: "payments" }
    ],
    contexts: ["hub"],
    trustSurface: false,
    status: "active",
    version: "2026-02-22.1",
    effectiveDate: "2026-02-22",
    lastReviewed: "2026-02-22"
  },
  {
    id: "P06",
    hub: "platform",
    section: "cancellation-refunds",
    question: "How do cancellations and refunds work overall?",
    answer:
      "Cancellation outcomes follow the policy snapshot captured at the time of booking.",
    answerMode: "policy_bound",
    requiredInputs: [],
    sourceRefs: [
      { type: "route", method: "GET", path: "/api/policy/active" },
      { type: "page", path: "policy.html", anchor: "cancellation" }
    ],
    contexts: ["hub"],
    trustSurface: false,
    status: "active",
    version: "2026-02-22.1",
    effectiveDate: "2026-02-22",
    lastReviewed: "2026-02-22"
  },
  {
    id: "P07",
    hub: "platform",
    section: "disputes",
    question: "How are reports or disputes handled?",
    answer:
      "Reports are reviewed using evidence and booking data to determine appropriate outcomes.",
    answerMode: "policy_bound",
    requiredInputs: [],
    sourceRefs: [
      { type: "route", method: "POST", path: "/api/bookings/:id/complaint" },
      { type: "route", method: "POST", path: "/api/moderation/report" },
      { type: "page", path: "policy.html", anchor: "disputes" }
    ],
    contexts: ["hub"],
    trustSurface: false,
    status: "active",
    version: "2026-02-22.1",
    effectiveDate: "2026-02-22",
    lastReviewed: "2026-02-22"
  },
  {
    id: "P08",
    hub: "platform",
    section: "privacy",
    question: "Why is the location revealed later?",
    answer:
      "Delayed location disclosure helps protect host privacy and supports safer coordination.",
    answerMode: "policy_bound",
    requiredInputs: [],
    sourceRefs: [
      { type: "page", path: "success.html", anchor: "booking-summary-card" },
      { type: "page", path: "policy.html", anchor: "privacy" }
    ],
    contexts: ["hub"],
    trustSurface: false,
    status: "active",
    version: "2026-02-22.1",
    effectiveDate: "2026-02-22",
    lastReviewed: "2026-02-22"
  },
  {
    id: "P09",
    hub: "platform",
    section: "policies",
    question: "What happens if policies change after my booking?",
    answer: "Your booking follows the policy snapshot captured at confirmation.",
    answerMode: "deterministic",
    requiredInputs: [],
    sourceRefs: [
      { type: "route", method: "GET", path: "/api/policy/active" },
      { type: "route", method: "POST", path: "/api/bookings/verify" },
      { type: "page", path: "policy.html", anchor: "policy-versioning" }
    ],
    contexts: ["hub"],
    trustSurface: false,
    status: "active",
    version: "2026-02-22.1",
    effectiveDate: "2026-02-22",
    lastReviewed: "2026-02-22"
  }
];

function __deepFreezeFaq(value) {
  if (!value || typeof value !== "object") return value;
  if (Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.keys(value).forEach((key) => {
    __deepFreezeFaq(value[key]);
  });
  return value;
}

__deepFreezeFaq(FAQ_CATALOG);
