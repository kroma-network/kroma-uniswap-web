import { skipToken } from '@reduxjs/toolkit/query/react'
import { Currency, CurrencyAmount, TradeType } from '@uniswap/sdk-core'
import { IMetric, MetricLoggerUnit, setGlobalMetric } from '@uniswap/smart-order-router'
import { sendTiming } from 'components/analytics'
import { AVERAGE_L1_BLOCK_TIME } from 'constants/chainInfo'
import { useStablecoinAmountFromFiatValue } from 'hooks/useStablecoinPrice'
import { useRoutingAPIArguments } from 'lib/hooks/routing/useRoutingAPIArguments'
import useIsValidBlock from 'lib/hooks/useIsValidBlock'
import ms from 'ms.macro'
import { useMemo } from 'react'
import { RouterPreference, useGetQuoteQuery } from 'state/routing/slice'

import { GetQuoteResult, InterfaceTrade, TradeState } from './types'
import { computeRoutes, transformRoutesToTrade } from './utils'

/**
 * Returns the best trade by invoking the routing api or the smart order router on the client
 * @param tradeType whether the swap is an exact in/out
 * @param amountSpecified the exact amount to swap in/out
 * @param otherCurrency the desired output/payment currency
 */
export function useRoutingAPITrade<TTradeType extends TradeType>(
  tradeType: TTradeType,
  amountSpecified: CurrencyAmount<Currency> | undefined,
  otherCurrency: Currency | undefined,
  routerPreference: RouterPreference
): {
  state: TradeState
  trade: InterfaceTrade<Currency, Currency, TTradeType> | undefined
} {
  const [currencyIn, currencyOut]: [Currency | undefined, Currency | undefined] = useMemo(
    () =>
      tradeType === TradeType.EXACT_INPUT
        ? [amountSpecified?.currency, otherCurrency]
        : [otherCurrency, amountSpecified?.currency],
    [amountSpecified, otherCurrency, tradeType]
  )

  const queryArgs = useRoutingAPIArguments({
    tokenIn: currencyIn,
    tokenOut: currencyOut,
    amount: amountSpecified,
    tradeType,
    routerPreference,
  })

  console.log("[pool] queryARgs", queryArgs)

  const { isLoading, isError, data, currentData } = useGetQuoteQuery(queryArgs ?? skipToken, {
    // Price-fetching is informational and costly, so it's done less frequently.
    pollingInterval: routerPreference === RouterPreference.PRICE ? ms`2m` : AVERAGE_L1_BLOCK_TIME,
  })
  // const { isLoading, isError, data, currentData } = {
  //   isLoading: false,
  //   isError: false,
  //   data: {
  //     amount: "1000000000000000000",
  //     amountDecimals: "1",
  //     blockNumber: "18964019",
  //     gasPriceWei: "25000000000",
  //     gasUseEstimate: "193000",
  //     gasUseEstimateQuote: "2938304709304750",
  //     gasUseEstimateQuoteDecimals: "0.00293830470930475",
  //     gasUseEstimateUSD: "0.00293830470930475",
  //     quote: "609891676305994594",
  //     quoteDecimals: "0.609891676305994594",
  //     quoteGasAdjusted: "606953371596689843",
  //     quoteGasAdjustedDecimals: "0.606953371596689843",
  //     quoteId: "066d0",
  //   },
  //   currentData: {
  //     amount: "1000000000000000000",
  //     amountDecimals: "1",
  //     blockNumber: "18964019",
  //     gasPriceWei: "25000000000",
  //     gasUseEstimate: "193000",
  //     gasUseEstimateQuote: "2938304709304750",
  //     gasUseEstimateQuoteDecimals: "0.00293830470930475",
  //     gasUseEstimateUSD: "0.00293830470930475",
  //     quote: "609891676305994594",
  //     quoteDecimals: "0.609891676305994594",
  //     quoteGasAdjusted: "606953371596689843",
  //     quoteGasAdjustedDecimals: "0.606953371596689843",
  //     quoteId: "066d0",}}
  console.log("[pool] query result", data, currentData)

  const quoteResult: any | undefined = useIsValidBlock(Number(data?.blockNumber) || 0) ? data : undefined

  console.log("[pool route] currencyIn", currencyIn, "currencyOut", currencyOut, "tradeType", tradeType, "quoteResult", quoteResult)
  const route = useMemo(
    () => computeRoutes(currencyIn, currencyOut, tradeType, quoteResult),
    [currencyIn, currencyOut, quoteResult, tradeType]
  )

  // get USD gas cost of trade in active chains stablecoin amount
  const gasUseEstimateUSD = useStablecoinAmountFromFiatValue(quoteResult?.gasUseEstimateUSD) ?? null

  const isSyncing = currentData !== data

  return useMemo(() => {
    if (!currencyIn || !currencyOut) {
      console.log("[pool trade] currencyin out", currencyIn, currencyOut)
      return {
        state: TradeState.INVALID,
        trade: undefined,
      }
    }

    if (isLoading && !quoteResult) {
      console.log("[pool trade] isLoading quoteResult", isLoading, quoteResult)
      // only on first hook render
      return {
        state: TradeState.LOADING,
        trade: undefined,
      }
    }

    let otherAmount = undefined
    if (quoteResult) {
      if (tradeType === TradeType.EXACT_INPUT && currencyOut) {
        otherAmount = CurrencyAmount.fromRawAmount(currencyOut, quoteResult.quote)
      }

      if (tradeType === TradeType.EXACT_OUTPUT && currencyIn) {
        otherAmount = CurrencyAmount.fromRawAmount(currencyIn, quoteResult.quote)
      }
    }

    if (isError || !otherAmount || !route || route.length === 0 || !queryArgs) {
      console.log(
        "[pool trade] isError",
        isError,
        "otherAmount",
        otherAmount,
        "route",
        route,
        "queryArgs",
        queryArgs
      );
      return {
        state: TradeState.NO_ROUTE_FOUND,
        trade: undefined,
      }
    }

    try {
      const trade = transformRoutesToTrade(route, tradeType, quoteResult?.blockNumber, gasUseEstimateUSD)
      console.log("[pool trade] trade", trade)
      return {
        // always return VALID regardless of isFetching status
        state: isSyncing ? TradeState.SYNCING : TradeState.VALID,
        trade,
      }
    } catch (e) {
      return { state: TradeState.INVALID, trade: undefined }
    }
  }, [
    currencyIn,
    currencyOut,
    quoteResult,
    isLoading,
    tradeType,
    isError,
    route,
    queryArgs,
    gasUseEstimateUSD,
    isSyncing,
  ])
}

// only want to enable this when app hook called
class GAMetric extends IMetric {
  putDimensions() {
    return
  }

  putMetric(key: string, value: number, unit?: MetricLoggerUnit) {
    sendTiming('Routing API', `${key} | ${unit}`, value, 'client')
  }
}

setGlobalMetric(new GAMetric())
