function extractJSON(text) {
  if (!text || typeof text !== 'string') return null;
  // Remove markdown fences
  text = text.replace(/```json\s*/g, '');
  text = text.replace(/```/g, '');

  // Try to find the first { ... } block
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  const jsonText = text.substring(start, end + 1);
  try {
    return JSON.parse(jsonText);
  } catch (e) {
    // try to fix common issues: trailing commas
    const cleaned = jsonText.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
    try {
      return JSON.parse(cleaned);
    } catch (e2) {
      return null;
    }
  }
}

module.exports = { extractJSON };
