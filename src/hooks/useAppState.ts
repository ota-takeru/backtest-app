import { useReducer, useCallback, useMemo } from "react";
import { StrategyAST, BacktestResponse } from "../types";
import { OHLCFrameJSON } from "../lib/types";

// State interface
export interface AppState {
  // Progress state
  progress: {
    value: number;
    message: string;
  };

  // Data configuration
  dataConfig: {
    codes: string[];
    startDate: string;
    endDate: string;
  } | null;

  // Strategy state
  validatedDsl: StrategyAST | null;
  showDsl: boolean;

  // Run configuration
  runConfig: {
    dsl: StrategyAST;
    codes: string[];
    startDate: string;
    endDate: string;
  } | null;

  // Loading states
  isLoadingData: boolean;
  isBacktestLoading: boolean;

  // Error states
  dataError: string | null;
  backtestError: string | null;

  // Data
  ohlcData: Record<string, OHLCFrameJSON>;
  backtestResult: BacktestResponse | null;

  // UI state
  isApiKeyModalOpen: boolean;
}

// Action types
export type AppAction =
  | { type: "SET_PROGRESS"; payload: { value: number; message: string } }
  | { type: "SET_DATA_CONFIG"; payload: AppState["dataConfig"] }
  | { type: "SET_VALIDATED_DSL"; payload: StrategyAST | null }
  | { type: "SET_SHOW_DSL"; payload: boolean }
  | { type: "SET_RUN_CONFIG"; payload: AppState["runConfig"] }
  | { type: "SET_LOADING_DATA"; payload: boolean }
  | { type: "SET_BACKTEST_LOADING"; payload: boolean }
  | { type: "SET_DATA_ERROR"; payload: string | null }
  | { type: "SET_BACKTEST_ERROR"; payload: string | null }
  | { type: "SET_OHLC_DATA"; payload: Record<string, OHLCFrameJSON> }
  | { type: "SET_BACKTEST_RESULT"; payload: BacktestResponse | null }
  | { type: "SET_API_KEY_MODAL_OPEN"; payload: boolean }
  | { type: "RESET_DATA" }
  | { type: "RESET_BACKTEST" };

// Initial state
const initialState: AppState = {
  progress: { value: 0, message: "" },
  dataConfig: null,
  validatedDsl: null,
  showDsl: false,
  runConfig: null,
  isLoadingData: false,
  isBacktestLoading: false,
  dataError: null,
  backtestError: null,
  ohlcData: {},
  backtestResult: null,
  isApiKeyModalOpen: false,
};

// Reducer
function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "SET_PROGRESS":
      return { ...state, progress: action.payload };

    case "SET_DATA_CONFIG":
      return { ...state, dataConfig: action.payload };

    case "SET_VALIDATED_DSL":
      return { ...state, validatedDsl: action.payload };

    case "SET_SHOW_DSL":
      return { ...state, showDsl: action.payload };

    case "SET_RUN_CONFIG":
      return { ...state, runConfig: action.payload };

    case "SET_LOADING_DATA":
      return { ...state, isLoadingData: action.payload };

    case "SET_BACKTEST_LOADING":
      return { ...state, isBacktestLoading: action.payload };

    case "SET_DATA_ERROR":
      return { ...state, dataError: action.payload };

    case "SET_BACKTEST_ERROR":
      return { ...state, backtestError: action.payload };

    case "SET_OHLC_DATA":
      return { ...state, ohlcData: action.payload };

    case "SET_BACKTEST_RESULT":
      return { ...state, backtestResult: action.payload };

    case "SET_API_KEY_MODAL_OPEN":
      return { ...state, isApiKeyModalOpen: action.payload };

    case "RESET_DATA":
      return {
        ...state,
        dataConfig: null,
        ohlcData: {},
        runConfig: null,
        validatedDsl: null,
        dataError: null,
        backtestResult: null,
        backtestError: null,
        progress: { value: 0, message: "" },
      };

    case "RESET_BACKTEST":
      return {
        ...state,
        backtestResult: null,
        backtestError: null,
        isBacktestLoading: false,
      };

    default:
      return state;
  }
}

// Hook
export function useAppState() {
  const [state, dispatch] = useReducer(appReducer, initialState);

  // Action creators - Use useMemo to prevent recreation on every render
  const actions = useMemo(
    () => ({
      setProgress: useCallback(
        (progress: { value: number; message: string }) => {
          dispatch({ type: "SET_PROGRESS", payload: progress });
        },
        []
      ),

      setDataConfig: useCallback((config: AppState["dataConfig"]) => {
        dispatch({ type: "SET_DATA_CONFIG", payload: config });
      }, []),

      setValidatedDsl: useCallback((dsl: StrategyAST | null) => {
        dispatch({ type: "SET_VALIDATED_DSL", payload: dsl });
      }, []),

      setShowDsl: useCallback((show: boolean) => {
        dispatch({ type: "SET_SHOW_DSL", payload: show });
      }, []),

      setRunConfig: useCallback((config: AppState["runConfig"]) => {
        dispatch({ type: "SET_RUN_CONFIG", payload: config });
      }, []),

      setLoadingData: useCallback((loading: boolean) => {
        dispatch({ type: "SET_LOADING_DATA", payload: loading });
      }, []),

      setBacktestLoading: useCallback((loading: boolean) => {
        dispatch({ type: "SET_BACKTEST_LOADING", payload: loading });
      }, []),

      setDataError: useCallback((error: string | null) => {
        dispatch({ type: "SET_DATA_ERROR", payload: error });
      }, []),

      setBacktestError: useCallback((error: string | null) => {
        dispatch({ type: "SET_BACKTEST_ERROR", payload: error });
      }, []),

      setOhlcData: useCallback((data: Record<string, OHLCFrameJSON>) => {
        dispatch({ type: "SET_OHLC_DATA", payload: data });
      }, []),

      setBacktestResult: useCallback((result: BacktestResponse | null) => {
        dispatch({ type: "SET_BACKTEST_RESULT", payload: result });
      }, []),

      setApiKeyModalOpen: useCallback((open: boolean) => {
        dispatch({ type: "SET_API_KEY_MODAL_OPEN", payload: open });
      }, []),

      resetData: useCallback(() => {
        dispatch({ type: "RESET_DATA" });
      }, []),

      resetBacktest: useCallback(() => {
        dispatch({ type: "RESET_BACKTEST" });
      }, []),
    }),
    []
  );

  return { state, actions };
}
