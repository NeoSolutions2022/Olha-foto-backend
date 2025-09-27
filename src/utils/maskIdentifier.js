const buildMaskedValue = (value) => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  if (trimmed.length <= 2) {
    return `${trimmed[0]}*`;
  }

  const middle = '*'.repeat(Math.max(1, trimmed.length - 2));
  return `${trimmed[0]}${middle}${trimmed[trimmed.length - 1]}`;
};

export const maskIdentifier = (value) => buildMaskedValue(value);

export default maskIdentifier;
