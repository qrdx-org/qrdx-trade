/** CSV for downloads: RFC 4180 quoting, and a guard against spreadsheet formula injection. */

export function toCsv<T>(rows: T[], columns: { header: string; value: (row: T) => string | number | null | undefined }[]): string {
  const cell = (v: string | number | null | undefined) => {
    let s = v == null ? '' : String(v)
    // A cell starting with = + - @ is run as a formula by spreadsheet apps; numbers are safe.
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [columns.map((c) => cell(c.header)).join(','), ...rows.map((r) => columns.map((c) => cell(c.value(r))).join(','))].join('\r\n') + '\r\n'
}

export function downloadText(filename: string, text: string, type = 'text/csv;charset=utf-8'): void {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
