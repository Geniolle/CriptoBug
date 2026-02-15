import * as React from 'react';

import { Screen } from '@/components/layout/Screen';
import { Header } from '@/components/layout/Header';
import { ExchangeCarousel } from '@/components/crypto/ExchangeCarousel';
import { TopAssetsDashboard } from '@/components/crypto/TopAssetsDashboard';
import { AssetDetailsModal } from '@/components/crypto/AssetDetailsModal';
import type { RankedAsset } from '@/lib/types';

export default function AnalyticsScreen() {
  const [asset, setAsset] = React.useState<RankedAsset | null>(null);

  return (
    <Screen>
      <Header title="Analitica" />
      <ExchangeCarousel />
      <TopAssetsDashboard onOpenAsset={setAsset} />
      <AssetDetailsModal asset={asset} onClose={() => setAsset(null)} />
    </Screen>
  );
}
