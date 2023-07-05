import TokenLogoLookupTable from 'constants/TokenLogoLookupTable'
import { SupportedChainId } from 'constants/chains'
import {
  TKRO_KROMA,
  // TEST_USDC_KROMA,
  // TEST_USDT_KROMA,
  USDC_KROMA,
  USDT_KROMA,
  WBTC_KROMA,
  WRAPPED_NATIVE_CURRENCY,
} from 'constants/tokens'
// import { chainIdToNetworkName, getNativeLogoURI } from 'lib/hooks/useCurrencyLogoURIs'
import { getNativeLogoURI } from 'lib/hooks/useCurrencyLogoURIs'
import uriToHttp from 'lib/utils/uriToHttp'
import { useCallback, useEffect, useState } from 'react'
import { isAddress } from 'utils'
import KromaWBTC from 'assets/images/kroma-wbtc.png'
import KromaWETH from 'assets/images/kroma-weth.png'
import KromaUSDC from 'assets/images/kroma-usdc.png'
import KromaUSDT from 'assets/images/kroma-usdt.png'
import KromaTNBGR from 'assets/images/kroma-tnbgr.png'

const BAD_SRCS: { [tokenAddress: string]: true } = {}

// Converts uri's into fetchable urls
function parseLogoSources(uris: string[]) {
  const urls: string[] = []
  uris.forEach((uri) => urls.push(...uriToHttp(uri)))
  return urls
}

// Parses uri's, favors non-coingecko images, and improves coingecko logo quality
function prioritizeLogoSources(uris: string[]) {
  const parsedUris = uris.map((uri) => uriToHttp(uri)).flat(1)
  const preferredUris: string[] = []

  // Consolidate duplicate coingecko urls into one fallback source
  let coingeckoUrl: string | undefined = undefined

  parsedUris.forEach((uri) => {
    if (uri.startsWith('https://assets.coingecko')) {
      if (!coingeckoUrl) {
        coingeckoUrl = uri.replace(/small|thumb/g, 'large')
      }
    } else {
      preferredUris.push(uri)
    }
  })
  // Places coingecko urls in the back of the source array
  return coingeckoUrl ? [...preferredUris, coingeckoUrl] : preferredUris
}

function getInitialUrl(address?: string | null, chainId?: number | null, isNative?: boolean) {
  if (chainId && isNative) return getNativeLogoURI(chainId)

  // const networkName = chainId ? chainIdToNetworkName(chainId) : 'ethereum'
  const checksummedAddress = isAddress(address)

  if (
    checksummedAddress === WRAPPED_NATIVE_CURRENCY[SupportedChainId.KROMA]?.address ||
    checksummedAddress === WRAPPED_NATIVE_CURRENCY[SupportedChainId.KROMA_DEPRECATED]?.address
  ) {
    return KromaWETH
  }

  if (checksummedAddress === WBTC_KROMA.address) {
    return KromaWBTC
  }

  if (checksummedAddress === USDC_KROMA.address) {
    return KromaUSDC
  }

  if (checksummedAddress === USDT_KROMA.address) {
    return KromaUSDT
  }

  if (checksummedAddress === TKRO_KROMA.address) {
    return KromaWETH
  }

  return KromaTNBGR

  // if (checksummedAddress) {
  //   return `https://raw.githubusercontent.com/Uniswap/assets/master/blockchains/${networkName}/assets/${checksummedAddress}/logo.png`
  // } else {
  //   return undefined
  // }
}

export default function useAssetLogoSource(
  address?: string | null,
  chainId?: number | null,
  isNative?: boolean,
  backupImg?: string | null
): [string | undefined, () => void] {
  const [current, setCurrent] = useState<string | undefined>(getInitialUrl(address, chainId, isNative))
  const [fallbackSrcs, setFallbackSrcs] = useState<string[] | undefined>(undefined)

  useEffect(() => {
    setCurrent(getInitialUrl(address, chainId, isNative))
    setFallbackSrcs(undefined)
  }, [address, chainId, isNative])

  const nextSrc = useCallback(() => {
    if (current) {
      BAD_SRCS[current] = true
    }
    // Parses and stores logo sources from tokenlists if assets repo url fails
    if (!fallbackSrcs) {
      const uris = TokenLogoLookupTable.getIcons(address) ?? []
      if (backupImg) uris.push(backupImg)
      const tokenListIcons = prioritizeLogoSources(parseLogoSources(uris))

      setCurrent(tokenListIcons.find((src) => !BAD_SRCS[src]))
      setFallbackSrcs(tokenListIcons)
    } else {
      setCurrent(fallbackSrcs.find((src) => !BAD_SRCS[src]))
    }
  }, [current, fallbackSrcs, address, backupImg])

  return [current, nextSrc]
}
