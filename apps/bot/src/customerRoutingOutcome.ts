export type CustomerRoutingOutcome =
  | "reply_sent"
  | "handoff_reply_sent"
  | "muted_no_reply"
  | "duplicate_no_reply"
  | "error_no_reply";

export const shouldMarkCustomerInboundRead = (outcome: CustomerRoutingOutcome): boolean =>
  outcome === "reply_sent" || outcome === "handoff_reply_sent";
