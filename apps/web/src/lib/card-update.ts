export type CardUpdateDraft = {
  kind: "result" | "blocker" | "decision_needed" | "note";
  summary: string;
  body: string;
  author: string;
};

export function newCardUpdateDraft(): CardUpdateDraft {
  return { kind: "note", summary: "", body: "", author: "Owner" };
}

export function hasCardUpdateDraft(draft: CardUpdateDraft) {
  return (
    draft.kind !== "note" ||
    draft.summary !== "" ||
    draft.body !== "" ||
    draft.author !== "Owner"
  );
}

export function cardUpdatePayload(cardId: string, draft: CardUpdateDraft) {
  if (!draft.summary.trim()) throw new Error("Add an update summary.");
  if ([...draft.summary].length > 500)
    throw new Error("Update summary must use 500 characters or fewer.");
  if (!draft.author.trim() || [...draft.author].length > 120)
    throw new Error("Update author must use 1–120 characters.");
  return {
    target: { type: "card" as const, id: cardId },
    kind: draft.kind,
    summary: draft.summary,
    body: draft.body,
    author: { kind: "human" as const, label: draft.author },
  };
}
