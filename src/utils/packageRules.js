export const PACKAGE_RULES = {
  pure: {
    limits: {
      pure: 3,
      define: 0,
      beyond: 0
    }
  },
  define: {
    limits: {
      pure: 1,
      define: 1,
      beyond: 0
    }
  },
  beyond: {
    limits: {
      pure: 0,
      define: 0,
      beyond: 1
    }
  }
};

export function getAllowedCategoriesForPackage(packageKey) {
  const rules = PACKAGE_RULES[packageKey];

  if (!rules) {
    return [];
  }

  return Object.entries(rules.limits)
    .filter(([, limit]) => limit > 0)
    .map(([categoryKey]) => categoryKey);
}
