import * as React from 'react';

import { Screen } from '@/components/layout/Screen';
import { Header } from '@/components/layout/Header';
import { TradeOngoing } from '@/components/trade/TradeOngoing';

export default function OngoingScreen() {
  return (
    <Screen>
      <Header title="Em andamento" />
      <TradeOngoing />
    </Screen>
  );
}

