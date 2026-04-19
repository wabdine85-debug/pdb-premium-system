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