/**
 * Google Sheets API client — uses the same OAuth token as Gmail.
 * Requires the token to have spreadsheets.readonly scope.
 */

export interface SheetRow {
  rowIndex: number  // 1-based row number in the sheet
  values: (string | null)[]
}

export interface SheetData {
  sheetName: string
  rows: SheetRow[]
}

/** Fetch all values from every tab in a spreadsheet. */
export async function getSpreadsheetData(
  spreadsheetId: string,
  accessToken: string
): Promise<SheetData[]> {
  // Get sheet metadata first
  const metaRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  if (!metaRes.ok) {
    const text = await metaRes.text()
    throw new Error(`Sheets metadata fetch failed: ${metaRes.status} ${text}`)
  }
  const meta = await metaRes.json()
  const sheetNames: string[] = meta.sheets.map(
    (s: { properties: { title: string } }) => s.properties.title
  )

  if (sheetNames.length === 0) return []

  // Batch-fetch all ranges in one call
  const ranges = sheetNames.map((name) => encodeURIComponent(name))
  const batchUrl =
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet` +
    `?${ranges.map((r) => `ranges=${r}`).join("&")}&valueRenderOption=UNFORMATTED_VALUE`

  const batchRes = await fetch(batchUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!batchRes.ok) {
    const text = await batchRes.text()
    throw new Error(`Sheets batchGet failed: ${batchRes.status} ${text}`)
  }

  const batchData = await batchRes.json()
  const valueRanges = batchData.valueRanges ?? []

  return sheetNames.map((sheetName, idx) => {
    const rawRows: (string | number | boolean)[][] = valueRanges[idx]?.values ?? []
    const rows: SheetRow[] = rawRows.map((row, rowIdx) => ({
      rowIndex: rowIdx + 1,
      values: row.map((cell) => (cell === "" || cell === undefined || cell === null ? null : String(cell))),
    }))
    return { sheetName, rows }
  })
}
