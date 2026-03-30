const parseDateString = (dateStr) => {
  if (!dateStr) return null;
  dateStr = dateStr.trim();
  
  // Try YYYY-MM-DD
  let m = dateStr.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})(?:[T\s].*)?$/);
  if (m) {
    const year = m[1];
    const month = m[2].padStart(2, '0');
    const day = m[3].padStart(2, '0');
    return `${year}-${month}-${day}T12:00:00.000Z`;
  }
  
  // Try MM/DD/YYYY or MM-DD-YYYY
  m = dateStr.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:[T\s].*)?$/);
  if (m) {
    let year = m[3];
    if (year.length === 2) year = `20${year}`;
    const month = m[1].padStart(2, '0');
    const day = m[2].padStart(2, '0');
    return `${year}-${month}-${day}T12:00:00.000Z`;
  }

  // Fallback to JS Date
  const parsedDate = new Date(dateStr);
  if (!isNaN(parsedDate.getTime())) {
    const year = parsedDate.getFullYear();
    const month = String(parsedDate.getMonth() + 1).padStart(2, '0');
    const day = String(parsedDate.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}T12:00:00.000Z`;
  }

  return null;
}

for (const d of ['2023-01-15', '1/15/2023', '01-15-2023', 'Jan 15, 2023', '2023/01/15']) {
    console.log(d, '->', parseDateString(d));
}
