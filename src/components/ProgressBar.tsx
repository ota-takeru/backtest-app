interface Props {
  progress: number; // 0 - 100
  message: string;
}

export function ProgressBar({ progress, message }: Props) {
  if (progress <= 0 || progress >= 100) return null;
  return (
    <div className="fixed top-0 left-0 w-full z-50" data-testid="progress-bar">
      <div
        className="bg-blue-100 text-blue-800 text-sm px-4 py-1 flex items-center"
        data-testid="progress-bar-content"
      >
        <div className="flex-1 truncate" data-testid="progress-bar-message">
          {message}
        </div>
        <div className="w-32 text-right" data-testid="progress-bar-percentage">
          {progress.toFixed(0)}%
        </div>
      </div>
      <div
        className="w-full bg-blue-200 h-1"
        data-testid="progress-bar-background"
      >
        <div
          className="bg-blue-600 h-1 transition-all duration-300 ease-out"
          style={{ width: `${progress}%` }}
          data-testid="progress-bar-fill"
        ></div>
      </div>
    </div>
  );
}
