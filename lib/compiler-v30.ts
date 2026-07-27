import { compilePine as compileBase } from "./compiler-v29";
import type { StrategyConfig } from "./types";

const KOHEN_DIVE = "kohen_dive_v4_6";
const KOHEN_DIVE_ADAPTIVE = "kohen_dive_adaptive_v1";
const pineBool = (value: boolean): string => value ? "true" : "false";
const pineFloat = (value: number): string => Number.isInteger(value) ? value.toFixed(1) : String(value);

function compileKohenDive(config: StrategyConfig): string {
  const adaptiveDefault = config.researchProfile === KOHEN_DIVE_ADAPTIVE;
  const signalMode = config.signalMode === "score" ? "Score" : "All filters";
  const stopConfirmation = config.risk.stopTrigger === "close" ? "Candle close" : "Wick touch";
  const countFromDefault = adaptiveDefault
    ? "2024-01-01T00:00:00+0000"
    : "2026-01-01T00:00:00+0000";

  return `// This Pine Script® code is subject to the terms of the Mozilla Public License 2.0 at https://mozilla.org/MPL/2.0/
// Original concept: Kohen Dive V4.6 (Anchored VWAP Edition)
// Kohen Pine Studio integration: confirmed signals, true rolling-low anchor, next-open risk tracking and dashboard metrics.
// Adaptive profile: regime-aware reversals plus trend-aligned pullback continuation entries.
// Default profile: Active 4H. Strict 4H remains selectable for isolated signal-profile A/B tests.
//@version=6
indicator(${JSON.stringify(config.name)}, shorttitle="KD4.6 PF", overlay=false, max_bars_back=2500, max_labels_count=500, max_lines_count=500)

// === Input groups ===
string G_VIS = "Visibility"
string G_SMOOTH = "Smoothing"
string G_STYLE = "Visualization"
string G_SIG = "Signal Settings"
string G_PD = "Premium/Discount & Anchored VWAP"
string G_RISK = "Kohen Pine Risk & Measurement"

// === Visibility ===
showNeutralCandle = input.bool(false, "Show neutral candles", group=G_VIS)
showLastCandles = input.int(333, "Show last N gradient markers", minval=0, group=G_VIS)
showSignals = input.bool(true, "Show strong signals", group=G_VIS)
showWeak = input.bool(true, "Show weak signals", group=G_VIS)
showPrice = input.bool(true, "Show price on label", group=G_VIS)
showRegimeEma = input.bool(true, "Show adaptive regime EMAs", group=G_VIS)

// === Smoothing and styling ===
adxLength = input.int(9, "ADX smoothing length", minval=1, group=G_SMOOTH)
smoothLength = input.int(1, "OHLC SMA length", minval=1, group=G_SMOOTH)
gradientBars = input.bool(true, "Gradient bar color", group=G_STYLE)
wickColoring = input.bool(true, "Wick coloring", group=G_STYLE)
gradientWindow = input.int(100, "Gradient window", minval=2, group=G_STYLE)
gradientTransparency = input.int(0, "Gradient transparency", minval=0, maxval=90, group=G_STYLE)
gammaBars = input.float(0.7, "Gamma bars", minval=0.05, step=0.05, group=G_STYLE)
gammaPlots = input.float(0.8, "Gamma plots", minval=0.05, step=0.05, group=G_STYLE)
wickTransparency = input.int(0, "Wick transparency", minval=0, maxval=90, group=G_STYLE)
upDark = input.color(#005A00, "Up dark", group=G_STYLE)
upNeon = input.color(#00FF66, "Up neon", group=G_STYLE)
downDark = input.color(#7A0000, "Down dark", group=G_STYLE)
downNeon = input.color(#FF1A1A, "Down neon", group=G_STYLE)

// === Signal settings ===
confirmedOnly = input.bool(${pineBool(config.confirmedBarsOnly)}, "Confirmed candles only", group=G_SIG)
cooldownBars = input.int(${config.execution.cooldownBars}, "Signal cooldown bars", minval=0, group=G_SIG)
triggerWindow = input.int(${config.triggerWindow}, "Trigger window (bars)", minval=1, group=G_SIG)
strongThreshold = input.float(0.80, "Strong threshold", minval=0.5, maxval=1.0, step=0.05, group=G_SIG)
useDivergence = input.bool(true, "Detect rolling RSI divergence pressure", group=G_SIG)
adaptiveMode = input.bool(${pineBool(adaptiveDefault)}, "Adaptive regime engine", group=G_SIG, tooltip="Requires structure confirmation for counter-trend reversals and adds trend-aligned pullback continuation signals.")
adaptiveSignalProfile = input.string("${adaptiveDefault ? "Active 4H" : "Strict 4H"}", "Adaptive signal profile", options=["Active 4H", "Strict 4H"], group=G_SIG, tooltip="Active 4H accepts state recovery and hybrid RSI/EMA/pressure continuation. Strict 4H keeps the original break-and-RSI-plus-pressure confirmation.")
allowContinuation = input.bool(true, "Allow trend continuation signals", group=G_SIG)
reversalConfirmWindow = input.int(8, "Reversal confirmation window", minval=1, maxval=50, group=G_SIG)
continuationLookback = input.int(8, "Continuation pullback lookback", minval=2, maxval=50, group=G_SIG)
continuationRsiLevel = input.float(50, "Continuation RSI reclaim level", minval=20, maxval=80, group=G_SIG)
regimeFastLength = input.int(20, "Regime fast EMA", minval=2, group=G_SIG)
regimeSlowLength = input.int(50, "Regime slow EMA", minval=3, group=G_SIG)
regimeSlopeBars = input.int(3, "VWAP regime slope bars", minval=1, maxval=20, group=G_SIG)
reverseOnOppositeSignal = input.bool(${pineBool(!adaptiveDefault)}, "Exit and reverse on opposite signal", group=G_SIG, tooltip="Off by default in Adaptive so an unproven opposite signal cannot cut a healthy trade early.")
signalMode = input.string("${signalMode}", "Signal mode", options=["All filters", "Score"], group=G_SIG)
scoreThreshold = input.int(${config.scoreThreshold}, "Minimum signal score", minval=0, maxval=100, group=G_SIG)
rsiLength = input.int(${config.momentum.rsiLength}, "RSI length", minval=2, group=G_SIG)
rsiLongLevel = input.float(${pineFloat(config.momentum.rsiLong)}, "Buy RSI ceiling", group=G_SIG)
rsiShortLevel = input.float(${pineFloat(config.momentum.rsiShort)}, "Sell RSI floor", group=G_SIG)

// === Premium/discount and true rolling-low anchored VWAP ===
pdLength = input.int(100, "PD lookback length", minval=20, group=G_PD)
showPdBackground = input.bool(${pineBool(config.execution.showBackground)}, "Show background zones", group=G_PD)
showPdLines = input.bool(true, "Show high/low lines", group=G_PD)
showAnchoredVwap = input.bool(true, "Show anchored VWAP", group=G_PD)
vwapAnchorLookback = input.int(200, "VWAP anchor lookback", minval=20, maxval=2000, group=G_PD, tooltip="VWAP starts at the actual lowest-low bar still inside this rolling window.")

// === Kohen Pine risk and measurement ===
expectedChartTimeframe = input.timeframe("${config.chartTimeframe}", "Expected chart timeframe", group=G_RISK)
enforceChartTimeframe = input.bool(${pineBool(config.execution.enforceChartTimeframe)}, "Block signals on a different chart timeframe", group=G_RISK)
entryType = input.string("Market (next open)", "Entry type", options=["Market (next open)", "Limit (pullback)"], group=G_RISK)
limitPullback = input.float(0.5, "Limit pullback (x risk)", minval=0, step=0.1, group=G_RISK)
limitExpiryBars = input.int(5, "Limit order expiry (bars)", minval=1, group=G_RISK)
atrLength = input.int(${config.risk.atrLength}, "ATR length", minval=1, group=G_RISK)
atrMultiple = input.float(${pineFloat(config.risk.atrMultiple)}, "ATR stop multiple", minval=0.1, step=0.1, group=G_RISK)
riskReward = input.float(${pineFloat(config.risk.riskReward)}, "Risk/reward", minval=0.1, step=0.1, group=G_RISK)
breakEvenAtR = input.float(${pineFloat(config.risk.breakEvenAtR)}, "Break-even at (R), 0 = off", minval=0, step=0.5, group=G_RISK)
trailStartR = input.float(${pineFloat(config.risk.trailStartR)}, "Trail starts at (R), 0 = off", minval=0, step=0.5, group=G_RISK)
trailDistanceR = input.float(${pineFloat(config.risk.trailDistanceR)}, "Trail distance (R)", minval=0.1, step=0.5, group=G_RISK)
stopConfirmation = input.string("${stopConfirmation}", "Stop confirmation", options=["Wick touch", "Candle close"], group=G_RISK)
costPerSide = input.float(0.01, "Commission + slippage per side (%)", minval=0, step=0.01, group=G_RISK)
countFrom = input.time(timestamp("${countFromDefault}"), "Count trades entered from", group=G_RISK)
countUntil = input.time(timestamp("2029-01-01T00:00:00+0000"), "Count trades entered until", group=G_RISK)
showRiskOutcomeLabels = input.bool(${pineBool(config.visual.showRiskOutcomeLabels)}, "Show stop/target outcome labels", group=G_RISK)
showDashboardPanel = input.bool(${pineBool(config.execution.showDashboard)}, "Show dashboard panel")

// === Helpers ===
clamp01(value) => math.max(0.0, math.min(1.0, value))
gammaAdjust(value, gamma) => math.pow(clamp01(value), gamma)
normalizeWindow(value, length) =>
    minimum = ta.lowest(value, length)
    maximum = ta.highest(value, length)
    denominator = maximum - minimum
    (value - minimum) / (denominator == 0 ? 1 : denominator)
priceText(price) => showPrice ? "\\n" + str.tostring(price, format.mintick) : ""

// === Kohen Dive pressure engine ===
openSmooth = ta.sma(open, smoothLength)
highSmooth = ta.sma(high, smoothLength)
lowSmooth = ta.sma(low, smoothLength)
closeSmooth = ta.sma(close, smoothLength)
trueRange = math.max(math.max(highSmooth - lowSmooth, math.abs(highSmooth - nz(closeSmooth[1]))), math.abs(lowSmooth - nz(closeSmooth[1])))
dmPlus = highSmooth - nz(highSmooth[1]) > nz(lowSmooth[1]) - lowSmooth ? math.max(highSmooth - nz(highSmooth[1]), 0) : 0
dmMinus = nz(lowSmooth[1]) - lowSmooth > highSmooth - nz(highSmooth[1]) ? math.max(nz(lowSmooth[1]) - lowSmooth, 0) : 0

var float smoothedRange = na
var float smoothedDmPlus = na
var float smoothedDmMinus = na
smoothedRange := na(smoothedRange[1]) ? trueRange : smoothedRange[1] - smoothedRange[1] / adxLength + trueRange
smoothedDmPlus := na(smoothedDmPlus[1]) ? dmPlus : smoothedDmPlus[1] - smoothedDmPlus[1] / adxLength + dmPlus
smoothedDmMinus := na(smoothedDmMinus[1]) ? dmMinus : smoothedDmMinus[1] - smoothedDmMinus[1] / adxLength + dmMinus
diPlus = na(smoothedRange) or smoothedRange == 0 ? na : smoothedDmPlus / smoothedRange * 100
diMinus = na(smoothedRange) or smoothedRange == 0 ? na : smoothedDmMinus / smoothedRange * 100

var int positiveCount = 0
var int negativeCount = 0
if not na(diPlus) and not na(diPlus[1]) and diPlus > diPlus[1] and diPlus > diMinus
    positiveCount += 1
    negativeCount := 0
if not na(diMinus) and not na(diMinus[1]) and diMinus > diMinus[1] and diMinus > diPlus
    negativeCount += 1
    positiveCount := 0

trendScore = positiveCount - negativeCount
trendColor = positiveCount >= negativeCount ? color.green : color.red
isBull = trendScore > 0
isBear = trendScore < 0

// === Gradients ===
magnitudeNormalized = normalizeWindow(math.abs(trendScore), gradientWindow)
magnitudeGamma = gammaAdjust(magnitudeNormalized, gammaBars)
rawBarColor = trendScore >= 0 ? color.from_gradient(magnitudeGamma, 0, 1, upDark, upNeon) : color.from_gradient(magnitudeGamma, 0, 1, downDark, downNeon)
barGradientColor = color.new(rawBarColor, gradientTransparency)
positiveNormalized = normalizeWindow(positiveCount, gradientWindow)
positiveGamma = gammaAdjust(positiveNormalized, gammaPlots)
positiveBase = color.from_gradient(positiveGamma, 0, 1, upDark, upNeon)
positiveColor = color.new(positiveBase, gradientTransparency)
negativeNormalized = normalizeWindow(negativeCount, gradientWindow)
negativeGamma = gammaAdjust(negativeNormalized, gammaPlots)
negativeBase = color.from_gradient(negativeGamma, 0, 1, downDark, downNeon)
negativeColor = color.new(negativeBase, gradientTransparency)
wickBase = trendScore >= 0 ? positiveBase : negativeBase
wickColor = color.new(wickBase, wickTransparency)

// === Premium/discount map ===
rangeHigh = ta.highest(high, pdLength)
rangeLow = ta.lowest(low, pdLength)
equilibrium = math.avg(rangeHigh, rangeLow)
inPremium = close > equilibrium
inDiscount = close < equilibrium

// === True rolling-low anchored VWAP ===
// The original accumulator only reset on a new rolling low, so an expired anchor could
// remain older than the requested lookback. Cumulative sums let the anchor move to the
// actual lowest bar still inside the window on every candle.
anchorBarsBack = math.abs(ta.lowestbars(low, vwapAnchorLookback))
cumulativePriceVolume = ta.cum(hlc3 * nz(volume))
cumulativeVolume = ta.cum(nz(volume))
priceVolumeBeforeAnchor = anchorBarsBack < bar_index ? cumulativePriceVolume[anchorBarsBack + 1] : 0.0
volumeBeforeAnchor = anchorBarsBack < bar_index ? cumulativeVolume[anchorBarsBack + 1] : 0.0
anchoredPriceVolume = cumulativePriceVolume - priceVolumeBeforeAnchor
anchoredVolume = cumulativeVolume - volumeBeforeAnchor
anchoredVwap = anchoredVolume > 0 ? anchoredPriceVolume / anchoredVolume : na

// === Original signal family plus optional adaptive regime engine ===
rsiValue = ta.rsi(close, rsiLength)
weakBuy = isBear and ta.crossover(negativeGamma, 0.65)
weakSell = isBull and ta.crossover(positiveGamma, 0.65)
bullDecay = positiveGamma < positiveGamma[1]
bearDecay = negativeGamma < negativeGamma[1]
sniperBuy = isBear and negativeGamma >= strongThreshold and (bearDecay or close > open) and rsiValue < rsiLongLevel
sniperSell = isBull and positiveGamma >= strongThreshold and (bullDecay or close < open) and rsiValue > rsiShortLevel

priceNewHigh = high >= ta.highest(high, 15)[1]
rsiLower = rsiValue < ta.highest(rsiValue, 15)[1]
rollingDivSell = useDivergence and inPremium and priceNewHigh and rsiLower and rsiValue > rsiShortLevel
priceNewLow = low <= ta.lowest(low, 15)[1]
rsiHigher = rsiValue > ta.lowest(rsiValue, 15)[1]
rollingDivBuy = useDivergence and inDiscount and priceNewLow and rsiHigher and rsiValue < rsiLongLevel

rawLongReversal = sniperBuy or rollingDivBuy
rawShortReversal = sniperSell or rollingDivSell
regimeFast = ta.ema(close, regimeFastLength)
regimeSlow = ta.ema(close, regimeSlowLength)
rollingVwapRising = anchoredVwap > anchoredVwap[regimeSlopeBars]
rollingVwapFalling = anchoredVwap < anchoredVwap[regimeSlopeBars]
strongBullRegime = regimeFast > regimeSlow and close > regimeFast and close > anchoredVwap and rollingVwapRising
strongBearRegime = regimeFast < regimeSlow and close < regimeFast and close < anchoredVwap and rollingVwapFalling

// A divergence is an alert, not a reversal by itself. In adaptive mode it arms a short
// window and must then receive price/pressure confirmation after the opposing regime weakens.
longReversalAge = ta.barssince(rawLongReversal)
shortReversalAge = ta.barssince(rawShortReversal)
longReversalArmed = not na(longReversalAge) and longReversalAge < reversalConfirmWindow
shortReversalArmed = not na(shortReversalAge) and shortReversalAge < reversalConfirmWindow
longStructureBreak = close > regimeFast and (ta.crossover(close, regimeFast) or ta.crossover(trendScore, 0))
shortStructureBreak = close < regimeFast and (ta.crossunder(close, regimeFast) or ta.crossunder(trendScore, 0))
activeSignalProfile = adaptiveMode and adaptiveSignalProfile == "Active 4H"
longStateRecovery = close > regimeFast and trendScore > 0
shortStateRecovery = close < regimeFast and trendScore < 0
longReversalTrigger = longReversalArmed and (activeSignalProfile ? longStateRecovery : longStructureBreak) and not strongBearRegime
shortReversalTrigger = shortReversalArmed and (activeSignalProfile ? shortStateRecovery : shortStructureBreak) and not strongBullRegime

// Trend-aligned pullback reclaims replace part of the frequency removed by the regime gate.
longPullbackSeen = ta.lowest(rsiValue, continuationLookback) < continuationRsiLevel
shortPullbackSeen = ta.highest(rsiValue, continuationLookback) > continuationRsiLevel
longRsiRecovery = ta.crossover(rsiValue, continuationRsiLevel)
shortRsiRecovery = ta.crossunder(rsiValue, continuationRsiLevel)
longPressureRecovery = ta.crossover(trendScore, 0)
shortPressureRecovery = ta.crossunder(trendScore, 0)
longEmaRecovery = ta.crossover(close, regimeFast)
shortEmaRecovery = ta.crossunder(close, regimeFast)
longStrictContinuation = longRsiRecovery and positiveGamma > positiveGamma[1]
shortStrictContinuation = shortRsiRecovery and negativeGamma > negativeGamma[1]
longHybridContinuation = longRsiRecovery or longEmaRecovery or longPressureRecovery
shortHybridContinuation = shortRsiRecovery or shortEmaRecovery or shortPressureRecovery
longContinuationTrigger = allowContinuation and strongBullRegime and longPullbackSeen and (activeSignalProfile ? longHybridContinuation : longStrictContinuation)
shortContinuationTrigger = allowContinuation and strongBearRegime and shortPullbackSeen and (activeSignalProfile ? shortHybridContinuation : shortStrictContinuation)

longTrigger = adaptiveMode ? longReversalTrigger or longContinuationTrigger : rawLongReversal
shortTrigger = adaptiveMode ? shortReversalTrigger or shortContinuationTrigger : rawShortReversal
longTriggerFamilyNow = adaptiveMode and longContinuationTrigger ? 1 : 2
shortTriggerFamilyNow = adaptiveMode and shortContinuationTrigger ? 1 : 2
longSignalFamily = nz(ta.valuewhen(longTrigger, longTriggerFamilyNow, 0), 2)
shortSignalFamily = nz(ta.valuewhen(shortTrigger, shortTriggerFamilyNow, 0), 2)
longTriggerAge = ta.barssince(longTrigger)
longTriggerActive = not na(longTriggerAge) and longTriggerAge < triggerWindow
shortTriggerAge = ta.barssince(shortTrigger)
shortTriggerActive = not na(shortTriggerAge) and shortTriggerAge < triggerWindow

legacyLongScore = math.round(negativeGamma * 55) + (rsiValue < rsiLongLevel ? 15 : 0) + (inDiscount ? 10 : 0) + (close <= anchoredVwap ? 10 : 0) + (rollingDivBuy ? 10 : 0)
legacyShortScore = math.round(positiveGamma * 55) + (rsiValue > rsiShortLevel ? 15 : 0) + (inPremium ? 10 : 0) + (close >= anchoredVwap ? 10 : 0) + (rollingDivSell ? 10 : 0)
adaptiveLongScore = longContinuationTrigger ? 60 + math.round(positiveGamma * 20) + (close > regimeFast ? 10 : 0) + (close > anchoredVwap ? 10 : 0) : longReversalTrigger ? 60 + math.round(negativeGamma * 15) + (inDiscount ? 10 : 0) + (close > regimeFast ? 10 : 0) : 0
adaptiveShortScore = shortContinuationTrigger ? 60 + math.round(negativeGamma * 20) + (close < regimeFast ? 10 : 0) + (close < anchoredVwap ? 10 : 0) : shortReversalTrigger ? 60 + math.round(positiveGamma * 15) + (inPremium ? 10 : 0) + (close < regimeFast ? 10 : 0) : 0
longScoreRaw = adaptiveMode ? adaptiveLongScore : legacyLongScore
shortScoreRaw = adaptiveMode ? adaptiveShortScore : legacyShortScore
longScore = math.min(100, longScoreRaw)
shortScore = math.min(100, shortScoreRaw)
confirmationOk = not confirmedOnly or barstate.isconfirmed
longScoreOk = confirmationOk and longScore >= scoreThreshold
shortScoreOk = confirmationOk and shortScore >= scoreThreshold
chartTimeframeAliasOk = timeframe.period == "1D" and expectedChartTimeframe == "D" or timeframe.period == "D" and expectedChartTimeframe == "1D"
chartTimeframeOk = timeframe.period == expectedChartTimeframe or chartTimeframeAliasOk
chartTimeframeAllowed = not enforceChartTimeframe or chartTimeframeOk
var int lastSignalBar = na
cooldownOk = na(lastSignalBar) or bar_index - lastSignalBar > cooldownBars
longSetup = longTriggerActive
shortSetup = shortTriggerActive
longSignalCandidate = chartTimeframeAllowed and confirmationOk and longTriggerActive and (signalMode == "Score" ? longScoreOk : true) and cooldownOk
shortSignalCandidate = chartTimeframeAllowed and confirmationOk and shortTriggerActive and (signalMode == "Score" ? shortScoreOk : true) and cooldownOk
signalConflict = longSignalCandidate and shortSignalCandidate
longSignal = longSignalCandidate and (not signalConflict or longScore > shortScore)
shortSignal = shortSignalCandidate and (not signalConflict or shortScore > longScore)
if longSignal or shortSignal
    lastSignalBar := bar_index

// === Pane and chart visuals ===
bgcolor(showPdBackground and inPremium ? color.new(color.red, 95) : na, title="Premium background", force_overlay=true)
bgcolor(showPdBackground and inDiscount ? color.new(color.green, 95) : na, title="Discount background", force_overlay=true)
plot(showPdLines ? rangeHigh : na, "High range", color=color.new(color.red, 50), force_overlay=true)
plot(showPdLines ? rangeLow : na, "Low range", color=color.new(color.green, 50), force_overlay=true)
plot(showPdLines ? equilibrium : na, "Equilibrium", color=color.gray, linewidth=2, force_overlay=true)
plot(showAnchoredVwap ? anchoredVwap : na, "Rolling-low anchored VWAP", color=color.yellow, linewidth=2, force_overlay=true)
plot(showRegimeEma and adaptiveMode ? regimeFast : na, "Adaptive fast EMA", color=color.aqua, linewidth=1, force_overlay=true)
plot(showRegimeEma and adaptiveMode ? regimeSlow : na, "Adaptive slow EMA", color=color.orange, linewidth=1, force_overlay=true)
plot(positiveCount, "Positive trend count", color=positiveColor, style=plot.style_columns)
plot(negativeCount, "Negative trend count", color=negativeColor, style=plot.style_columns)
plotshape(showLastCandles > 0, title="Gradient marker", style=shape.square, location=location.bottom, color=barGradientColor, size=size.tiny, show_last=showLastCandles)
barcolor(wickColoring ? na : gradientBars ? barGradientColor : showNeutralCandle ? trendColor : na)
plotcandle(wickColoring ? open : na, wickColoring ? high : na, wickColoring ? low : na, wickColoring ? close : na, title="Wick coloring", color=wickColoring ? wickColor : na, wickcolor=wickColoring ? wickColor : na, bordercolor=wickColoring ? wickColor : na, force_overlay=true)
plot(-5, "", chart.bg_color, editable=false)

if showWeak and confirmationOk and weakBuy
    label.new(bar_index, low, "B", style=label.style_label_up, color=color.new(color.lime, 30), textcolor=color.white, yloc=yloc.belowbar, size=size.tiny, force_overlay=true)
if showWeak and confirmationOk and weakSell
    label.new(bar_index, high, "S", style=label.style_label_down, color=color.new(color.red, 30), textcolor=color.white, yloc=yloc.abovebar, size=size.tiny, force_overlay=true)

// === Kohen Pine next-open risk lifecycle ===
atrValue = ta.atr(atrLength)
var float riskEntry = na
var float riskStop = na
var float riskTarget = na
var float riskUnit = na
var float riskBestR = 0.0
var int riskDirection = 0
var int riskStartedBar = na
var int riskStartedTime = na
var int pendingDirection = 0
var int pendingFamily = 0
var float pendingRisk = na
var float pendingLimit = na
var int pendingExpires = na
var int riskFamily = 0
var string lastRiskOutcome = "NONE"
var float lastOutcomeEntry = na
var float lastOutcomePrice = na
var int lastOutcomeEntryTime = na
var int lastOutcomeTime = na
var int riskWinCount = 0
var int riskLossCount = 0
var float riskNetR = 0.0
var float riskGrossWinR = 0.0
var float riskGrossLossR = 0.0
var float riskPeakR = 0.0
var float riskMaxDrawdownR = 0.0
var int longWinCount = 0
var int longLossCount = 0
var int shortWinCount = 0
var int shortLossCount = 0
var int continuationWinCount = 0
var int continuationLossCount = 0
var int reversalWinCount = 0
var int reversalLossCount = 0
var int gatedRawReversalCount = 0

if adaptiveMode and confirmationOk and time >= countFrom and time < countUntil and (rawLongReversal and strongBearRegime or rawShortReversal and strongBullRegime)
    gatedRawReversalCount += 1

acceptedLongSignal = longSignal and (riskDirection == 0 or reverseOnOppositeSignal and riskDirection == -1)
acceptedShortSignal = shortSignal and (riskDirection == 0 or reverseOnOppositeSignal and riskDirection == 1)
if showSignals and acceptedLongSignal
    longText = adaptiveMode ? (longSignalFamily == 1 ? "STRONG\\nBUY(CONT)" : "STRONG\\nBUY(REV)") : rollingDivBuy ? "STRONG\\nBUY(DIV)" : "STRONG\\nBUY"
    label.new(bar_index, low, longText + priceText(close), style=label.style_label_up, color=color.lime, textcolor=color.black, yloc=yloc.belowbar, size=size.small, force_overlay=true)
if showSignals and acceptedShortSignal
    shortText = adaptiveMode ? (shortSignalFamily == 1 ? "STRONG\\nSELL(CONT)" : "STRONG\\nSELL(REV)") : rollingDivSell ? "STRONG\\nSELL(DIV)" : "STRONG\\nSELL"
    label.new(bar_index, high, shortText + priceText(close), style=label.style_label_down, color=color.red, textcolor=color.white, yloc=yloc.abovebar, size=size.small, force_overlay=true)

entryUsesLimit = entryType == "Limit (pullback)"
longFillPrice = entryUsesLimit ? math.min(open, pendingLimit) : open
longFillReady = pendingDirection == 1 and riskDirection == 0 and pendingRisk > 0 and (not entryUsesLimit or low <= pendingLimit)
if longFillReady
    riskEntry := longFillPrice
    riskStop := longFillPrice - pendingRisk
    riskTarget := longFillPrice + pendingRisk * riskReward
    riskUnit := pendingRisk
    riskBestR := 0.0
    riskDirection := 1
    riskFamily := pendingFamily
    riskStartedBar := bar_index
    riskStartedTime := time
    pendingDirection := 0
    pendingFamily := 0
    pendingRisk := na
shortFillPrice = entryUsesLimit ? math.max(open, pendingLimit) : open
shortFillReady = pendingDirection == -1 and riskDirection == 0 and pendingRisk > 0 and (not entryUsesLimit or high >= pendingLimit)
if shortFillReady
    riskEntry := shortFillPrice
    riskStop := shortFillPrice + pendingRisk
    riskTarget := shortFillPrice - pendingRisk * riskReward
    riskUnit := pendingRisk
    riskBestR := 0.0
    riskDirection := -1
    riskFamily := pendingFamily
    riskStartedBar := bar_index
    riskStartedTime := time
    pendingDirection := 0
    pendingFamily := 0
    pendingRisk := na
if pendingDirection != 0 and entryUsesLimit and not na(pendingExpires) and bar_index > pendingExpires
    pendingDirection := 0
    pendingFamily := 0
    pendingRisk := na

oppositeSignalReversal = reverseOnOppositeSignal and (riskDirection == 1 and shortSignal or riskDirection == -1 and longSignal)
if oppositeSignalReversal
    lastRiskOutcome := "REVERSED"
    lastOutcomeEntry := riskEntry
    lastOutcomePrice := close
    reversalRiskUnit = riskUnit
    reversalGrossR = riskDirection == 1 ? (close - riskEntry) / reversalRiskUnit : (riskEntry - close) / reversalRiskUnit
    reversalR = reversalRiskUnit > 0 ? reversalGrossR - costPerSide / 100.0 * (riskEntry + close) / reversalRiskUnit : na
    countReversal = not na(reversalR) and not na(riskStartedTime) and riskStartedTime >= countFrom and riskStartedTime < countUntil
    riskNetR := riskNetR + (countReversal ? reversalR : 0.0)
    riskGrossWinR := riskGrossWinR + (countReversal and reversalR > 0 ? reversalR : 0.0)
    riskGrossLossR := riskGrossLossR + (countReversal and reversalR <= 0 ? -reversalR : 0.0)
    riskWinCount := riskWinCount + (countReversal and reversalR > 0 ? 1 : 0)
    riskLossCount := riskLossCount + (countReversal and reversalR <= 0 ? 1 : 0)
    longWinCount := longWinCount + (countReversal and riskDirection == 1 and reversalR > 0 ? 1 : 0)
    longLossCount := longLossCount + (countReversal and riskDirection == 1 and reversalR <= 0 ? 1 : 0)
    shortWinCount := shortWinCount + (countReversal and riskDirection == -1 and reversalR > 0 ? 1 : 0)
    shortLossCount := shortLossCount + (countReversal and riskDirection == -1 and reversalR <= 0 ? 1 : 0)
    continuationWinCount := continuationWinCount + (countReversal and riskFamily == 1 and reversalR > 0 ? 1 : 0)
    continuationLossCount := continuationLossCount + (countReversal and riskFamily == 1 and reversalR <= 0 ? 1 : 0)
    reversalWinCount := reversalWinCount + (countReversal and riskFamily == 2 and reversalR > 0 ? 1 : 0)
    reversalLossCount := reversalLossCount + (countReversal and riskFamily == 2 and reversalR <= 0 ? 1 : 0)
    riskPeakR := math.max(riskPeakR, riskNetR)
    riskMaxDrawdownR := math.max(riskMaxDrawdownR, riskPeakR - riskNetR)
    lastOutcomeEntryTime := riskStartedTime
    lastOutcomeTime := time
    if showRiskOutcomeLabels
        label.new(bar_index, close, lastRiskOutcome, style=label.style_label_left, color=color.orange, textcolor=color.white, size=size.small, force_overlay=true)
    riskEntry := na
    riskStop := na
    riskTarget := na
    riskUnit := na
    riskDirection := 0
    riskFamily := 0
    riskStartedBar := na
    riskStartedTime := na

if acceptedLongSignal and riskDirection == 0
    pendingDirection := 1
    pendingFamily := longSignalFamily
    pendingRisk := atrValue * atrMultiple
    pendingLimit := close - pendingRisk * limitPullback
    pendingExpires := bar_index + limitExpiryBars
if acceptedShortSignal and riskDirection == 0
    pendingDirection := -1
    pendingFamily := shortSignalFamily
    pendingRisk := atrValue * atrMultiple
    pendingLimit := close + pendingRisk * limitPullback
    pendingExpires := bar_index + limitExpiryBars

plot(riskStop, "Risk Stop", color=color.red, linewidth=2, style=plot.style_linebr, force_overlay=true)
plot(riskTarget, "Risk Target", color=color.green, linewidth=2, style=plot.style_linebr, force_overlay=true)
riskCanResolve = riskDirection != 0 and not na(riskStartedBar) and bar_index >= riskStartedBar
longStopHit = riskCanResolve and riskDirection == 1 and (stopConfirmation == "Candle close" ? close <= riskStop : low <= riskStop)
longTargetHit = riskCanResolve and riskDirection == 1 and high >= riskTarget
shortStopHit = riskCanResolve and riskDirection == -1 and (stopConfirmation == "Candle close" ? close >= riskStop : high >= riskStop)
shortTargetHit = riskCanResolve and riskDirection == -1 and low <= riskTarget
riskStopHit = longStopHit or shortStopHit
riskTargetHit = longTargetHit or shortTargetHit
riskAmbiguous = riskStopHit and riskTargetHit
if riskCanResolve and (riskStopHit or riskTargetHit)
    lastRiskOutcome := riskAmbiguous ? "AMBIGUOUS" : riskStopHit ? "STOP HIT" : "TARGET HIT"
    outcomeStopFill = stopConfirmation == "Candle close" ? close : riskStop
    outcomePrice = riskAmbiguous ? outcomeStopFill : riskStopHit ? outcomeStopFill : riskTarget
    lastOutcomeEntry := riskEntry
    lastOutcomePrice := outcomePrice
    outcomeRiskUnit = riskUnit
    outcomeGrossR = riskAmbiguous ? -1.0 : (riskDirection == 1 ? (outcomePrice - riskEntry) / outcomeRiskUnit : (riskEntry - outcomePrice) / outcomeRiskUnit)
    outcomeR = outcomeRiskUnit > 0 ? outcomeGrossR - costPerSide / 100.0 * (riskEntry + outcomePrice) / outcomeRiskUnit : na
    countOutcome = not na(outcomeR) and not na(riskStartedTime) and riskStartedTime >= countFrom and riskStartedTime < countUntil
    riskNetR := riskNetR + (countOutcome ? outcomeR : 0.0)
    riskGrossWinR := riskGrossWinR + (countOutcome and outcomeR > 0 ? outcomeR : 0.0)
    riskGrossLossR := riskGrossLossR + (countOutcome and outcomeR <= 0 ? -outcomeR : 0.0)
    riskWinCount := riskWinCount + (countOutcome and outcomeR > 0 ? 1 : 0)
    riskLossCount := riskLossCount + (countOutcome and outcomeR <= 0 ? 1 : 0)
    longWinCount := longWinCount + (countOutcome and riskDirection == 1 and outcomeR > 0 ? 1 : 0)
    longLossCount := longLossCount + (countOutcome and riskDirection == 1 and outcomeR <= 0 ? 1 : 0)
    shortWinCount := shortWinCount + (countOutcome and riskDirection == -1 and outcomeR > 0 ? 1 : 0)
    shortLossCount := shortLossCount + (countOutcome and riskDirection == -1 and outcomeR <= 0 ? 1 : 0)
    continuationWinCount := continuationWinCount + (countOutcome and riskFamily == 1 and outcomeR > 0 ? 1 : 0)
    continuationLossCount := continuationLossCount + (countOutcome and riskFamily == 1 and outcomeR <= 0 ? 1 : 0)
    reversalWinCount := reversalWinCount + (countOutcome and riskFamily == 2 and outcomeR > 0 ? 1 : 0)
    reversalLossCount := reversalLossCount + (countOutcome and riskFamily == 2 and outcomeR <= 0 ? 1 : 0)
    riskPeakR := math.max(riskPeakR, riskNetR)
    riskMaxDrawdownR := math.max(riskMaxDrawdownR, riskPeakR - riskNetR)
    lastOutcomeEntryTime := riskStartedTime
    lastOutcomeTime := time
    if showRiskOutcomeLabels
        outcomeColor = riskAmbiguous ? color.orange : riskStopHit ? color.red : color.green
        label.new(bar_index, outcomePrice, lastRiskOutcome, style=label.style_label_left, color=outcomeColor, textcolor=color.white, size=size.small, force_overlay=true)
    riskEntry := na
    riskStop := na
    riskTarget := na
    riskUnit := na
    riskDirection := 0
    riskFamily := 0
    riskStartedBar := na
    riskStartedTime := na

// === Stop management ===
if riskDirection != 0 and not na(riskUnit) and riskUnit > 0
    riskExcursion = riskDirection == 1 ? (high - riskEntry) / riskUnit : (riskEntry - low) / riskUnit
    if riskExcursion > riskBestR
        riskBestR := riskExcursion
    if breakEvenAtR > 0 and riskBestR >= breakEvenAtR
        riskStop := riskDirection == 1 ? math.max(riskStop, riskEntry) : math.min(riskStop, riskEntry)
    if trailStartR > 0 and riskBestR >= trailStartR
        riskTrailed = riskDirection == 1 ? riskEntry + (riskBestR - trailDistanceR) * riskUnit : riskEntry - (riskBestR - trailDistanceR) * riskUnit
        riskStop := riskDirection == 1 ? math.max(riskStop, riskTrailed) : math.min(riskStop, riskTrailed)

// === Dashboard ===
profitFactor = riskGrossLossR > 0 ? riskGrossWinR / riskGrossLossR : na
dashboardBackground = color.new(color.rgb(15, 23, 42), 8)
var table dashboard = table.new(position.top_right, 2, 19, border_width=1, force_overlay=true)
if barstate.islast and showDashboardPanel
    table.cell(dashboard, 0, 0, "Kohen Dive", bgcolor=color.new(color.blue, 70), text_color=color.white, text_size=size.normal)
    table.cell(dashboard, 1, 0, adaptiveMode ? (activeSignalProfile ? "ACTIVE 4H" : "STRICT 4H") : "BASELINE", bgcolor=dashboardBackground, text_color=color.orange, text_size=size.normal)
    table.cell(dashboard, 0, 1, "Long state", bgcolor=dashboardBackground, text_color=color.white)
    table.cell(dashboard, 1, 1, acceptedLongSignal ? "SIGNAL" : longSetup ? "READY" : "WAIT", bgcolor=dashboardBackground, text_color=acceptedLongSignal or longSetup ? color.lime : color.gray)
    table.cell(dashboard, 0, 2, "Short state", bgcolor=dashboardBackground, text_color=color.white)
    table.cell(dashboard, 1, 2, acceptedShortSignal ? "SIGNAL" : shortSetup ? "READY" : "WAIT", bgcolor=dashboardBackground, text_color=acceptedShortSignal or shortSetup ? color.red : color.gray)
    table.cell(dashboard, 0, 3, "Chart TF", bgcolor=dashboardBackground, text_color=color.white)
    table.cell(dashboard, 1, 3, chartTimeframeOk ? "OK" : "WRONG: " + expectedChartTimeframe, bgcolor=dashboardBackground, text_color=chartTimeframeOk ? color.lime : color.red)
    table.cell(dashboard, 0, 4, "Trend pressure", bgcolor=dashboardBackground, text_color=color.white)
    table.cell(dashboard, 1, 4, str.tostring(trendScore), bgcolor=dashboardBackground, text_color=isBull ? color.lime : isBear ? color.red : color.gray)
    table.cell(dashboard, 0, 5, "PD zone", bgcolor=dashboardBackground, text_color=color.white)
    table.cell(dashboard, 1, 5, inDiscount ? "DISCOUNT" : inPremium ? "PREMIUM" : "EQ", bgcolor=dashboardBackground, text_color=inDiscount ? color.lime : inPremium ? color.red : color.gray)
    table.cell(dashboard, 0, 6, "Anchored VWAP", bgcolor=dashboardBackground, text_color=color.white)
    table.cell(dashboard, 1, 6, close >= anchoredVwap ? "ABOVE" : "BELOW", bgcolor=dashboardBackground, text_color=close >= anchoredVwap ? color.lime : color.red)
    table.cell(dashboard, 0, 7, "Risk state", bgcolor=dashboardBackground, text_color=color.white)
    table.cell(dashboard, 1, 7, riskDirection == 1 ? "ACTIVE LONG" : riskDirection == -1 ? "ACTIVE SHORT" : pendingDirection != 0 ? "PENDING" : "NONE", bgcolor=dashboardBackground, text_color=riskDirection == 1 ? color.lime : riskDirection == -1 ? color.red : color.gray)
    table.cell(dashboard, 0, 8, "Last result", bgcolor=dashboardBackground, text_color=color.white)
    table.cell(dashboard, 1, 8, lastRiskOutcome, bgcolor=dashboardBackground, text_color=lastRiskOutcome == "TARGET HIT" ? color.lime : lastRiskOutcome == "STOP HIT" ? color.red : lastRiskOutcome == "NONE" ? color.gray : color.orange)
    table.cell(dashboard, 0, 9, "Wins / Losses", bgcolor=dashboardBackground, text_color=color.white)
    table.cell(dashboard, 1, 9, str.tostring(riskWinCount) + " / " + str.tostring(riskLossCount), bgcolor=dashboardBackground, text_color=color.white)
    table.cell(dashboard, 0, 10, "Win rate (net)", bgcolor=dashboardBackground, text_color=color.white)
    table.cell(dashboard, 1, 10, riskWinCount + riskLossCount > 0 ? str.tostring(100.0 * riskWinCount / (riskWinCount + riskLossCount), "#.#") + "%" : "NO DATA", bgcolor=dashboardBackground, text_color=riskNetR > 0 ? color.lime : riskNetR < 0 ? color.red : color.gray)
    table.cell(dashboard, 0, 11, "Net result", bgcolor=dashboardBackground, text_color=color.white)
    table.cell(dashboard, 1, 11, (riskNetR >= 0 ? "+" : "") + str.tostring(riskNetR, "#.##") + "R", bgcolor=dashboardBackground, text_color=riskNetR > 0 ? color.lime : riskNetR < 0 ? color.red : color.gray)
    table.cell(dashboard, 0, 12, "Profit factor", bgcolor=dashboardBackground, text_color=color.white)
    table.cell(dashboard, 1, 12, na(profitFactor) ? "N/A" : str.tostring(profitFactor, "#.##"), bgcolor=dashboardBackground, text_color=not na(profitFactor) and profitFactor > 1 ? color.lime : color.red)
    table.cell(dashboard, 0, 13, "Max drawdown", bgcolor=dashboardBackground, text_color=color.white)
    table.cell(dashboard, 1, 13, str.tostring(riskMaxDrawdownR, "#.##") + "R", bgcolor=dashboardBackground, text_color=riskMaxDrawdownR > 0 ? color.orange : color.gray)
    table.cell(dashboard, 0, 14, "Long W / L", bgcolor=dashboardBackground, text_color=color.white)
    table.cell(dashboard, 1, 14, str.tostring(longWinCount) + " / " + str.tostring(longLossCount), bgcolor=dashboardBackground, text_color=longWinCount >= longLossCount ? color.lime : color.white)
    table.cell(dashboard, 0, 15, "Short W / L", bgcolor=dashboardBackground, text_color=color.white)
    table.cell(dashboard, 1, 15, str.tostring(shortWinCount) + " / " + str.tostring(shortLossCount), bgcolor=dashboardBackground, text_color=shortWinCount >= shortLossCount ? color.lime : color.white)
    table.cell(dashboard, 0, 16, "Continuation W / L", bgcolor=dashboardBackground, text_color=color.white)
    table.cell(dashboard, 1, 16, str.tostring(continuationWinCount) + " / " + str.tostring(continuationLossCount), bgcolor=dashboardBackground, text_color=continuationWinCount >= continuationLossCount ? color.lime : color.white)
    table.cell(dashboard, 0, 17, "Reversal W / L", bgcolor=dashboardBackground, text_color=color.white)
    table.cell(dashboard, 1, 17, str.tostring(reversalWinCount) + " / " + str.tostring(reversalLossCount), bgcolor=dashboardBackground, text_color=reversalWinCount >= reversalLossCount ? color.lime : color.white)
    table.cell(dashboard, 0, 18, "Raw reversals gated", bgcolor=dashboardBackground, text_color=color.white)
    table.cell(dashboard, 1, 18, str.tostring(gatedRawReversalCount), bgcolor=dashboardBackground, text_color=gatedRawReversalCount > 0 ? color.orange : color.gray)

// === Alerts ===
${config.execution.alertsEnabled ? `alertcondition(acceptedLongSignal, "Kohen Dive strong buy", "KOHEN DIVE BUY {{ticker}} @ {{close}}")
alertcondition(acceptedShortSignal, "Kohen Dive strong sell", "KOHEN DIVE SELL {{ticker}} @ {{close}}")` : "// Alerts disabled in Kohen Pine Studio."}
`;
}

export function compilePine(config: StrategyConfig): string {
  if (config.researchProfile === KOHEN_DIVE || config.researchProfile === KOHEN_DIVE_ADAPTIVE) return compileKohenDive(config);
  return compileBase(config);
}
