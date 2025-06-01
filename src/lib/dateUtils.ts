/**
 * J-Quants無料枠に基づくデフォルト日付を計算
 * 無料枠では12週間前までのデータが取得可能
 */
export function getDefaultDateRange() {
  const today = new Date();

  // デフォルト終了日: 今日から12週間前
  const defaultEndDateValue = new Date(today);
  defaultEndDateValue.setDate(today.getDate() - 12 * 7); // 12 weeks ago
  const defaultEndDate = defaultEndDateValue.toISOString().split("T")[0];

  // デフォルト開始日: デフォルト終了日から2年前
  const defaultStartDateValue = new Date(defaultEndDateValue);
  defaultStartDateValue.setFullYear(defaultEndDateValue.getFullYear() - 2); // 2 years before defaultEndDate
  const defaultStartDate = defaultStartDateValue.toISOString().split("T")[0];

  return {
    startDate: defaultStartDate,
    endDate: defaultEndDate,
  };
}

/**
 * 日付範囲の妥当性を検証
 */
export function validateDateRange(startDate: string, endDate: string): boolean {
  return new Date(startDate) < new Date(endDate);
}
