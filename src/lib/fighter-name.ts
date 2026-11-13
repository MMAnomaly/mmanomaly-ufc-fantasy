/** ł/đ/ø/æ/ß do not decompose under NFD, so they have to be rewritten first. */
export function transliterateFighterName(value: string): string {
  return value
    .replace(/ł/g, "l")
    .replace(/Ł/g, "L")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/ø/g, "o")
    .replace(/Ø/g, "O")
    .replace(/æ/g, "ae")
    .replace(/Æ/g, "Ae")
    .replace(/ß/g, "ss");
}
