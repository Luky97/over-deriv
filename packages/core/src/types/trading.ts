export interface ActiveSymbol {
  exchange_is_open: number;
  is_trading_suspended: number;
  market: string;
  market_display_name?: string;
  pip_size: number;
  subgroup: string;
  subgroup_display_name?: string;
  submarket: string;
  submarket_display_name?: string;
  trade_count: number;
  underlying_symbol: string;
  underlying_symbol_name: string;
  underlying_symbol_type: string;
}

export interface Tick {
  ask: number;
  bid: number;
  epoch: number;
  id: string;
  pip_size: number;
  quote: number;
  symbol: string;
}

export interface TicksHistoryResponse {
  history: {
    prices: number[];
    times: number[];
  };
}
