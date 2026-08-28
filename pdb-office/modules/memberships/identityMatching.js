function normalizeIdentityName(name = "") {
  return String(name)
    .toLowerCase()
    .replace(/ae/g, "a")
    .replace(/oe/g, "o")
    .replace(/ue/g, "u")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b\d{1,2}\/\d{2,4}\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeIban(value = "") {
  return String(value).replace(/\s+/g, "").toUpperCase();
}

function hasCompleteName(name = "") {
  const tokens = normalizeIdentityName(name).split(" ").filter(Boolean);
  return tokens.length >= 2 && tokens.every(token => token.length >= 2);
}

function uniqueMatch(matches) {
  return matches.length === 1 ? matches[0] : null;
}

export function findSafeIdentityMatch(members, { name = "", iban = "", currentMemberId = "" } = {}) {
  const people = Array.isArray(members) ? members : [];
  if (currentMemberId) {
    const current = uniqueMatch(people.filter(member => member.id === currentMemberId));
    if (current) return current;
  }

  const normalizedIban = normalizeIban(iban);
  if (normalizedIban) {
    const ibanMatch = uniqueMatch(people.filter(member => normalizeIban(member.iban) === normalizedIban));
    if (ibanMatch) return ibanMatch;
  }

  const normalizedName = normalizeIdentityName(name);
  if (!normalizedName || !hasCompleteName(name)) return null;
  const exactNameMatch = uniqueMatch(people.filter(member => normalizeIdentityName(member.name) === normalizedName));
  if (exactNameMatch) return exactNameMatch;

  const requestedTokens = normalizedName.split(" ").filter(Boolean);
  const strongMatches = people.filter(member => {
    if (!hasCompleteName(member.name)) return false;
    const memberName = normalizeIdentityName(member.name);
    const memberTokens = memberName.split(" ").filter(Boolean);
    const sharedTokens = requestedTokens.filter(token => memberTokens.includes(token));
    return memberName.includes(normalizedName)
      || normalizedName.includes(memberName)
      || sharedTokens.length >= 2;
  });
  return uniqueMatch(strongMatches);
}
