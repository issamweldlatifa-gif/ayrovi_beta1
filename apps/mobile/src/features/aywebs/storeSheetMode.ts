/** Amazon and Zalando support choosing a merchant-published variant in the sheet.
 * Other stores retain their existing merchant-page confirmation flow. */
export function readOnlyStoreSelection(storeId: string | null | undefined): boolean {
  const id = String(storeId ?? '').trim().toLowerCase();
  return id !== 'amazon' && id !== 'zalando';
}
