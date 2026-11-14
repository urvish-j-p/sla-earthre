/**
 * Minimal RFC 4180 CSV parser.
 *
 * Why hand-rolled instead of a library: the Lambda has zero runtime
 * dependencies besides Prisma (smaller bundle, faster cold start), and the
 * format we need is small: quoted fields, escaped quotes ("") and LF/CRLF
 * line endings. A UTF-8 BOM is stripped.
 *
 * Returns the header and every data record with its 1-based line number, so
 * data-quality samples can point at the exact line in the original file.
 */
export function parseCsv(text) {
  if (typeof text !== 'string') throw new TypeError('parseCsv expects a string');
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  const records = [];
  let field = '';
  let record = [];
  let inQuotes = false;
  let line = 1; // physical line currently being read
  let recordLine = 1; // physical line where the current record started

  const pushRecord = () => {
    record.push(field);
    // skip fully blank lines
    if (!(record.length === 1 && record[0] === '')) records.push({ line: recordLine, values: record });
    record = [];
    field = '';
  };

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];

    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        if (ch === '\n') line++;
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      record.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      pushRecord();
      line++;
      recordLine = line;
    } else {
      field += ch;
    }
  }
  if (field !== '' || record.length > 0) pushRecord();

  if (records.length === 0) return { header: [], rows: [] };
  const [headerRecord, ...rows] = records;
  return {
    header: headerRecord.values.map((h) => h.trim().toLowerCase()),
    rows,
  };
}
