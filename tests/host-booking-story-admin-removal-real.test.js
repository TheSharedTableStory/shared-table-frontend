// GAP 31 (2026-09-15), sir's order O-128: the host's Booking Details rows tell the truth about a
// seat an administrator cancelled, including what happened to the money.
//
// WHAT WAS WRONG: the routine that turns a booking into the three plain-English rows on the host's
// Booking Details panel (grep "function __hostBookingStory" in js/my-bookings.js) decided who had
// cancelled a seat from two timestamps alone, hostCancelledAt and guestCancelledAt. An
// administrator removing a listing cancels the reserved seats on it and writes neither timestamp,
// so the seat fell through to the never-completed branch and the host read:
//
//     Status   Not completed
//     Payment  No charge (the guest didn't finish paying)
//
// Both lines blamed a guest who had done nothing wrong, for a removal the platform itself had
// made. The booking now carries a record of who cancelled it (grep "cancellation" in the booking
// rows the host list returns), and the screen reads that record.
//
// AND THE MONEY ROW had a second fault of its own. It decided "No charge (the guest had not paid
// yet)" from the refund FIGURE alone, and a paid seat whose refund FAILED keeps that figure at
// zero (grep `status: "refund_failed"` in the backend). So a guest who had paid in full and was
// still waiting for the money to come back was reported to the host as never having paid at all.
// The row is now gated on the same dead-payment signal the never-completed branch uses, and the
// third state has a sentence of its own.
//
// WHY THIS FILE EXISTS: the routine returns the exact words a host reads. Reading the source
// cannot tell whether the right branch is reached for a given booking shape; only running the real
// page script against a real booking can. Every case here executes the shipped function.

import { describe, test, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const COMMON_SRC = readFileSync(resolve(__dirname, "..", "js", "common.js"), "utf-8");
const SRC = readFileSync(resolve(__dirname, "..", "js", "my-bookings.js"), "utf-8");

beforeAll(() => {
  document.body.innerHTML = `
    <div id="content-area"></div>
    <button id="tab-trips"></button>
    <button id="tab-hosting"></button>
    <button id="tab-wishlist"></button>
  `;
  Object.defineProperty(window, "location", {
    value: { pathname: "/my-bookings.html", search: "", origin: "https://example.com", href: "https://example.com/my-bookings.html" },
    writable: true, configurable: true,
  });
  window.authFetch = async () => ({ ok: false, status: 500, json: async () => ({}) });
  window.tstsGetSession = async () => ({ ok: false });
  window.tstsNotify = () => {};
  try {
    // eslint-disable-next-line no-eval
    (0, eval)(COMMON_SRC);
  } catch (_c) {
    void _c; // common.js also bootstraps navbar and footer for a real page; only its helpers matter here
  }
  // NOT wrapped: if the edit broke the page script, this must fail loudly.
  // eslint-disable-next-line no-eval
  (0, eval)(SRC);
});

// A seat an administrator's removal cancelled: the guest had reserved it and never paid,
// so no money moved and neither cancel timestamp was ever written.
function removedByAdmin(over) {
  return Object.assign({
    _id: "bk-admin-1",
    status: "cancelled",
    paymentStatus: "unpaid",
    bookingDate: "2026-10-02",
    timeSlot: "18:00 - 20:00",
    guests: 2,
    currency: "aud",
    cancellation: { by: "admin", at: "2026-09-14T02:00:00.000Z", reasonCode: "admin_force_delete" },
  }, over || {});
}

describe("the host's Booking Details rows on a seat an administrator cancelled", () => {
  test("it says the platform cancelled it, and never says the guest failed to pay", () => {
    const story = window.__hostBookingStory(removedByAdmin());

    expect(story.status).toBe("Cancelled by our team");
    expect(story.payment).toBe("No charge (the guest had not paid yet)");
    expect(story.payout).toBe("");
    // The two sentences that used to appear here, gone.
    expect(story.status).not.toBe("Not completed");
    expect(story.payment).not.toContain("didn't finish paying");
  });

  test("a paid seat the same removal refunded says what went back to the guest", () => {
    const story = window.__hostBookingStory(removedByAdmin({
      paymentStatus: "paid",
      amountCents: 24000,
      refundDecision: { amountCents: 24000 },
    }));

    expect(story.status).toBe("Cancelled by our team");
    expect(story.payment).toContain("Refunded");
    expect(story.payment).toContain("A$240");
    expect(story.payment).toContain("to the guest");
  });

  test("every word is plain English: no machine text, no code, no em dash", () => {
    [removedByAdmin(), removedByAdmin({ paymentStatus: "paid", amountCents: 24000, refundDecision: { amountCents: 24000 } })]
      .forEach((booking) => {
        const story = window.__hostBookingStory(booking);
        [story.status, story.payment, story.payout].forEach((line) => {
          expect(line).not.toContain("—");
          expect(line).not.toContain("admin_force_delete");
          expect(line).not.toContain("cancellation");
          expect(line).not.toContain("undefined");
          expect(line).not.toMatch(/[A-Z][A-Z_]{3,}/);
        });
      });
  });
});

describe("D1: the money row on a seat our own team cancelled", () => {
  test("a PAID seat whose refund failed never reads as No charge", () => {
    // refundDecision.status is refund_failed and amountCents stays 0, which is exactly the shape
    // the backend leaves behind when the card provider refuses the refund.
    const story = window.__hostBookingStory(removedByAdmin({
      paymentStatus: "paid",
      amountCents: 24000,
      refundDecision: { amountCents: 0, status: "refund_failed", lastError: "card_declined" },
    }));

    expect(story.status).toBe("Cancelled by our team");
    expect(story.payment).not.toBe("No charge (the guest had not paid yet)");
    expect(story.payment).not.toContain("No charge");
    expect(story.payment).toContain("A$240");
    expect(story.payment).toContain("paid");
    expect(story.payment).toContain("the refund has not reached the guest yet");
  });

  test("a PAID seat with no refund figure at all reads the same true sentence", () => {
    const story = window.__hostBookingStory(removedByAdmin({
      paymentStatus: "paid",
      amountCents: 24000,
    }));
    expect(story.payment).toContain("the refund has not reached the guest yet");
    expect(story.payment).not.toContain("No charge");
  });

  test("a paid seat with no amount on it still reads a sentence, never a blank", () => {
    const story = window.__hostBookingStory(removedByAdmin({ paymentStatus: "paid" }));
    expect(story.payment).toBe("Paid, the refund has not reached the guest yet");
  });

  test("No charge is said only when the payment really is dead", () => {
    ["unpaid", "abandoned", "failed", ""].forEach((pay) => {
      const story = window.__hostBookingStory(removedByAdmin({ paymentStatus: pay }));
      expect(story.payment).toBe("No charge (the guest had not paid yet)");
    });
  });

  test("a refund that did go back still reads as the refund, whatever the payment state says", () => {
    const story = window.__hostBookingStory(removedByAdmin({
      paymentStatus: "paid",
      amountCents: 24000,
      totalRefundedCents: 24000,
    }));
    expect(story.payment).toContain("Refunded");
    expect(story.payment).toContain("A$240");
  });
});

describe("the record is read for the other two actors as well", () => {
  test("a host cancellation with no timestamp still reads as the host's own", () => {
    const story = window.__hostBookingStory({
      _id: "bk-host-1",
      status: "cancelled",
      paymentStatus: "paid",
      currency: "aud",
      amountCents: 18000,
      refundDecision: { amountCents: 18000 },
      cancellation: { by: "host", at: "2026-09-14T02:00:00.000Z", reasonCode: "host_cancel" },
    });
    expect(story.status).toBe("Cancelled by you");
    // STRENGTHENED 2026-09-15: the money row is produced by the same branch now, so it is pinned
    // here too rather than left to the branch below.
    expect(story.payment).toBe("Refunded A$180 to the guest");
  });

  test("a guest cancellation with no timestamp still reads as the guest's", () => {
    const story = window.__hostBookingStory({
      _id: "bk-guest-1",
      status: "cancelled",
      paymentStatus: "paid",
      currency: "aud",
      amountCents: 18000,
      refundDecision: { amountCents: 9000 },
      cancellation: { by: "guest", at: "2026-09-14T02:00:00.000Z", reasonCode: "guest_cancel" },
    });
    expect(story.status).toBe("Cancelled by the guest");
    expect(story.payment).toBe("Refunded A$90 to the guest");
  });
});

// 2026-09-15: the same fault D1 exists to kill was still live for every actor that is NOT the
// administrator, because the branch above only read the record when the administrator had acted.
describe("a host-cancelled seat tells the host the true money story", () => {
  function cancelledByHost(over) {
    return Object.assign({
      _id: "bk-hostcancel-1",
      // The host cancel route and the host-cancel helper both leave this status, never "cancelled"
      // (grep `booking.status = "cancelled_by_host"` and `transitionBooking(booking,
      // "cancelled_by_host")` in the backend), so a host-cancelled seat reached NO branch at all
      // and fell to the plain fallback: "Cancelled by host" beside a bare "A$240", with nothing
      // said about the guest's money.
      status: "cancelled_by_host",
      paymentStatus: "paid",
      currency: "aud",
      amountCents: 24000,
      hostCancelledAt: "2026-09-14T02:00:00.000Z",
      cancellation: { by: "host", at: "2026-09-14T02:00:00.000Z", reasonCode: "host_cancel" },
    }, over || {});
  }

  test("a PAID seat whose refund failed never reads as a bare amount", () => {
    const story = window.__hostBookingStory(cancelledByHost({
      refundDecision: { amountCents: 0, status: "refund_failed", lastError: "card_declined" },
    }));
    expect(story.status).toBe("Cancelled by you");
    expect(story.payment).toBe("A$240 paid, the refund has not reached the guest yet");
    // The two readings it used to produce, gone.
    expect(story.status).not.toBe("Cancelled by host");
    expect(story.payment).not.toBe("A$240");
    expect(story.payment).not.toBe("No refund (per the cancellation policy)");
  });

  test("the same seat once the refund goes through keeps its story", () => {
    const story = window.__hostBookingStory(cancelledByHost({
      refundDecision: { amountCents: 24000, status: "refund_requested" },
    }));
    expect(story.status).toBe("Cancelled by you");
    expect(story.payment).toBe("Refunded A$240 to the guest");
  });

  test("a guest's own cancellation that the policy returns nothing for still says so", () => {
    const story = window.__hostBookingStory({
      _id: "bk-guestzero-1",
      status: "cancelled",
      paymentStatus: "paid",
      currency: "aud",
      amountCents: 24000,
      refundDecision: { amountCents: 0, status: "manual", percent: 0 },
      cancellation: { by: "guest", at: "2026-09-14T02:00:00.000Z", reasonCode: "guest_cancel" },
    });
    expect(story.status).toBe("Cancelled by the guest");
    expect(story.payment).toBe("No refund (per the cancellation policy)");
  });

  test("a guest cancellation whose refund FAILED does not hide behind the policy", () => {
    const story = window.__hostBookingStory({
      _id: "bk-guestfail-1",
      status: "cancelled",
      paymentStatus: "paid",
      currency: "aud",
      amountCents: 24000,
      refundDecision: { amountCents: 0, status: "refund_failed", lastError: "card_declined" },
      cancellation: { by: "guest", at: "2026-09-14T02:00:00.000Z", reasonCode: "guest_cancel" },
    });
    expect(story.payment).toBe("A$240 paid, the refund has not reached the guest yet");
    expect(story.payment).not.toContain("per the cancellation policy");
  });
});

// 2026-09-15: a private booking request the HOST declined read, on the HOST's own panel,
// "Not completed / No charge (the guest didn't finish paying)" - the exact sentence D1 exists to
// kill, still live, with a correct record sitting unread on the booking. The three closing routes
// all leave status "cancelled" with paymentStatus "abandoned" (grep `bk.paymentStatus =
// "abandoned"` in __settlePrivateRequestTerminal), which is why "Cancelled by you" could never be
// reached in practice before: the never-completed branch fired first on every one of them.
describe("a private booking request that ended reads as the decision it was", () => {
  function heldSeat(over) {
    return Object.assign({
      _id: "bk-pr-1",
      status: "cancelled",
      paymentStatus: "abandoned",
      currency: "aud",
      amountCents: 24000,
    }, over || {});
  }

  test("a request the host declined says the host decided it, and never blames the guest", () => {
    const story = window.__hostBookingStory(heldSeat({
      cancellation: { by: "host", at: "2026-09-14T02:00:00.000Z", reasonCode: "private_request_declined" },
    }));
    expect(story.status).toBe("Cancelled by you");
    expect(story.payment).toBe("No charge (the guest had not paid yet)");
    expect(story.status).not.toBe("Not completed");
    expect(story.payment).not.toContain("didn't finish paying");
  });

  test("a request our own team declined says our team decided it", () => {
    const story = window.__hostBookingStory(heldSeat({
      cancellation: { by: "admin", at: "2026-09-14T02:00:00.000Z", reasonCode: "private_request_declined" },
    }));
    expect(story.status).toBe("Cancelled by our team");
    expect(story.payment).toBe("No charge (the guest had not paid yet)");
  });

  test("a request the guest withdrew says the guest did", () => {
    const story = window.__hostBookingStory(heldSeat({
      cancellation: { by: "guest", at: "2026-09-14T02:00:00.000Z", reasonCode: "private_request_declined" },
    }));
    expect(story.status).toBe("Cancelled by the guest");
    expect(story.payment).toBe("No charge (the guest had not paid yet)");
  });

  test("a request that simply ran out of time, with nobody behind it, is still never completed", () => {
    const story = window.__hostBookingStory(heldSeat({
      cancellation: { by: "", at: "2026-09-14T02:00:00.000Z", reasonCode: "private_request_expired" },
    }));
    expect(story.status).toBe("Not completed");
  });
});

// 2026-09-15: the platform's own state machine moves a cancelled seat to "refunded" when the card
// provider confirms the money is back (grep `cancelled_by_host: ["refunded"]` in
// transitionBooking). At that moment the seat used to lose its whole story: the branch named only
// two statuses, so it fell to the fallback and read "Refunded" beside a bare "A$240", as if the
// guest had paid it rather than had it returned.
describe("the story survives the card provider confirming the refund", () => {
  test("a seat our team cancelled still says so once the refund lands", () => {
    const story = window.__hostBookingStory({
      _id: "bk-refunded-1",
      status: "refunded",
      paymentStatus: "paid",
      currency: "aud",
      amountCents: 24000,
      refundedAt: "2026-09-14T06:00:00.000Z",
      refundDecision: { amountCents: 24000, status: "refund_requested" },
      totalRefundedCents: 24000,
      cancellation: { by: "admin", at: "2026-09-14T02:00:00.000Z", reasonCode: "admin_listing_deleted" },
    });
    expect(story.status).toBe("Cancelled by our team");
    expect(story.payment).toBe("Refunded A$240 to the guest");
    expect(story.payment).not.toBe("A$240");
  });

  test("a refunded seat with no figure recorded still reads as a refund, never as a payment", () => {
    const story = window.__hostBookingStory({
      _id: "bk-refunded-2",
      status: "refunded",
      paymentStatus: "paid",
      currency: "aud",
      amountCents: 24000,
      cancellation: { by: "host", at: "2026-09-14T02:00:00.000Z", reasonCode: "host_cancel" },
    });
    expect(story.status).toBe("Cancelled by you");
    expect(story.payment).toBe("Refunded to the guest");
    expect(story.payment).not.toContain("has not reached the guest");
  });
});

describe("nothing else on this panel moved", () => {
  test("a seat the guest abandoned still reads as never completed", () => {
    const story = window.__hostBookingStory({
      _id: "bk-abandoned-1",
      status: "cancelled",
      paymentStatus: "abandoned",
      currency: "aud",
    });
    expect(story.status).toBe("Not completed");
    expect(story.payment).toBe("No charge (the guest didn't finish paying)");
  });

  test("a live paid booking is untouched", () => {
    const story = window.__hostBookingStory({
      _id: "bk-live-1",
      status: "confirmed",
      paymentStatus: "paid",
      currency: "aud",
      amountCents: 24000,
    });
    expect(story.status).toBe("Confirmed");
    expect(story.payment).toContain("A$240");
    expect(story.payout).toContain("held until after the event");
  });

  test("a completed booking is untouched", () => {
    const story = window.__hostBookingStory({
      _id: "bk-done-1",
      status: "completed",
      paymentStatus: "paid",
      currency: "aud",
      amountCents: 24000,
      payoutStatus: "released",
    });
    expect(story.status).toBe("Completed");
    expect(story.payout).toContain("released to you");
  });

  test("a seat still waiting on the card hold is untouched", () => {
    const story = window.__hostBookingStory({
      _id: "bk-auth-1",
      status: "authorized",
      paymentStatus: "unpaid",
      currency: "aud",
      amountCents: 24000,
    });
    expect(story.status).toBe("Awaiting confirmation");
    expect(story.payment).toContain("held, not yet charged");
  });
});
