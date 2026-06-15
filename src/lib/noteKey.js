// Notes are keyed per item number only (global across all orders for that item)
export function noteKey(itemNumber) {
  return `${itemNumber}____`
}
