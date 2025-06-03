interface Props {
  progress: number; // 0 - 100
  message: string;
}

export function ProgressBar({ progress, message }: Props) {
  return (
    <div className="w-full" data-testid="progress-bar-component">
      <div
        className="bg-blue-100 text-blue-800 text-sm px-4 py-2 flex items-center rounded-t"
        data-testid="progress-bar-content"
      >
        <div className="flex-1 truncate" data-testid="progress-text">
          {message}
        </div>
        <div className="w-32 text-right" data-testid="progress-bar-percentage">
          {progress.toFixed(0)}%
        </div>
      </div>
      <div
        className="w-full bg-blue-200 h-2 rounded-b"
        data-testid="progress-bar-background"
      >
        <div
          className="bg-blue-600 h-2 transition-all duration-300 ease-out rounded-b"
          style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
          data-testid="progress-bar-fill"
        ></div>
      </div>
    </div>
  );
}
