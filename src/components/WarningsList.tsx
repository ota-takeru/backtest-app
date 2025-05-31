import React from "react";

interface WarningsListProps {
  warnings?: string[];
}

const WarningsList: React.FC<WarningsListProps> = ({ warnings }) => {
  if (!warnings || warnings.length === 0) {
    return null; // 警告がない場合は何も表示しない
  }

  return (
    <div
      className="p-4 bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700"
      data-testid="warnings-list"
    >
      <h3 className="font-bold" data-testid="warnings-list-title">
        警告
      </h3>
      <ul className="list-disc list-inside" data-testid="warnings-list-items">
        {warnings.map((warning, index) => (
          <li key={index} data-testid={`warning-item-${index}`}>
            {warning}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default WarningsList;
