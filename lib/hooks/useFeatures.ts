'use client'

import type { FeaturesResponse } from '../server/features'
import { useNet } from '../wallet/WalletContext'
import { useApi } from './useApi'

export type Features = Omit<FeaturesResponse, 'source' | 'asOf'>

/**
 * What this network's node runs. Until it answers, nothing new is offered: a feature the
 * node predates would only fail when signed.
 */
export function useFeatures(): Features & { known: boolean } {
  const { apiBase } = useNet()
  const { data } = useApi<FeaturesResponse>(`${apiBase}/features`, 60_000)
  return data
    ? { ...data, known: true }
    : {
        known: false,
        trading: false,
        history: false,
        costs: {
          poolBurnSubsidized: '',
          poolStakeStandard: '',
          perpListingFee: null,
          exchangeMinGasPriceWei: null,
          perpOpenListing: null,
          perpMinLiquidity: null,
          deployerMinBond: null,
          oracleStaleSeconds: null,
        },
      }
}
