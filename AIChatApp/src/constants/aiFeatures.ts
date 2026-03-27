export const AI_FEATURE_KEYS = {
  autoReply: "aiFeature_autoReply",
  autoReplyByUser: "aiFeature_autoReplyByUser",
  suggestions: "aiFeature_suggestions",
  suggestionsByUser: "aiFeature_suggestionsByUser",
  rewrite: "aiFeature_rewrite",
  rewriteByUser: "aiFeature_rewriteByUser"
} as const;

export const AI_FEATURE_DEFAULTS = {
  autoReply: false,
  suggestions: true,
  rewrite: true
} as const;
