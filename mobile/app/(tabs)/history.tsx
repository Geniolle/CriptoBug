import * as React from 'react';

import { Screen } from '@/components/layout/Screen';
import { Header } from '@/components/layout/Header';
import { TradeHistory } from '@/components/trade/TradeHistory';

export default function HistoryScreen() {
  return (
    <Screen>
      <Header title="Historico" />
      <TradeHistory />
    </Screen>
  );
}

