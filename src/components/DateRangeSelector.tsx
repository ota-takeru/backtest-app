interface DateRangeSelectorProps {
  startDate: string;
  endDate: string;
  onStartDateChange: (date: string) => void;
  onEndDateChange: (date: string) => void;
}

export function DateRangeSelector({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
}: DateRangeSelectorProps) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <label htmlFor="startDate" className="block font-medium mb-1">
          開始日:
        </label>
        <input
          type="date"
          id="startDate"
          value={startDate}
          onChange={(e) => onStartDateChange(e.target.value)}
          className="border p-2 w-full rounded"
          required
          data-testid="start-date-input"
        />
      </div>

      <div>
        <label htmlFor="endDate" className="block font-medium mb-1">
          終了日:
        </label>
        <input
          type="date"
          id="endDate"
          value={endDate}
          onChange={(e) => onEndDateChange(e.target.value)}
          className="border p-2 w-full rounded"
          required
          data-testid="end-date-input"
        />
      </div>
    </div>
  );
}
