import { AIProvider, ChatMessage } from "./ai.provider";
const RESPONSES: Record<string, string> = {
  default:
    "I'm your logistics operations assistant. I can help with customers, shipments, tracking, and platform usage.",
  tracking:
    "Each shipment has a unique tracking number (e.g., TRK-2026-001). Use the Shipments section to view current status, origin, and destination.",
  status:
    "Shipment statuses: Pending (awaiting pickup), PickedUp (collected), InTransit (en route), Delivered (arrived), Cancelled (voided).",
  customer:
    "The Customers section lets you create, view, update, and soft-delete customer records. Each customer can have multiple shipments.",
  dashboard:
    "The Dashboard shows total customers, total shipments, and a real-time status distribution chart.",
};
export class MockAIProvider implements AIProvider {
  async generateResponse(messages: ChatMessage[]): Promise<string> {
    const userMessages = messages.filter((m) => m.role === "user");
    const last =
      userMessages[userMessages.length - 1]?.content?.toLowerCase() || "";
    if (last.includes("track") || last.includes("number"))
      return RESPONSES.tracking;
    if (
      last.includes("status") ||
      last.includes("transit") ||
      last.includes("deliver")
    )
      return RESPONSES.status;
    if (last.includes("customer")) return RESPONSES.customer;
    if (last.includes("dashboard")) return RESPONSES.dashboard;
    return RESPONSES.default;
  }
}
