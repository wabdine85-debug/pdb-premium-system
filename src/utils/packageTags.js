export function resolvePackageFromTags(tags = []) {
  if (tags.includes("premium-private")) return "private";
  if (tags.includes("premium-beyond")) return "beyond";
  if (tags.includes("premium-define")) return "define";
  if (tags.includes("premium-pure")) return "pure";

  return null;
}
