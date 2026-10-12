/** Read both JSONB language objects and the older text[] storage without losing levels. */
export function decodeResumeLanguage(value: any): any {
  if (typeof value === 'string' && value.trim().startsWith('{')) {
    try { const parsed = JSON.parse(value); return parsed && typeof parsed === 'object' && (parsed.name || parsed.language) ? parsed : null; } catch { /* Keep a legacy plain label. */ }
  }
  return value;
}
export function resumeLanguages(value: unknown): Array<{ name: string; level?: string }> {
  if (typeof value === 'string') { const source = value; try { value = JSON.parse(source); } catch { value = source.split(/[,;\n]/); } }
  const rows = Array.isArray(value) ? value : value ? [value] : [];
  return rows.map(decodeResumeLanguage).map(item => {
    if (typeof item === 'string' && item.trim()) return { name: item.trim() };
    const name = item?.name || item?.language;
    if (typeof name !== 'string' || !name.trim()) return null;
    const level = item.level || item.grade;
    return { name: name.trim(), ...(typeof level === 'string' && level && level !== 'unspecified' ? { level } : {}) };
  }).filter((row): row is { name: string; level?: string } => row !== null);
}
