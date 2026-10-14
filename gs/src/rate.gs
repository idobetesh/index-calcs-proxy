/**
 * Bank of Israel policy rate and prime (BOI + 1.5%) via Worker /rate.
 *
 * Usage:
 *   =BOI_RATE()     → e.g. 4 (percent, not decimal fraction)
 *   =PRIME_RATE()   → e.g. 5.5
 *   =TEXT(BOI_RATE(), "0.00") & "%"
 */

/** @returns {number} BOI rate in percent (e.g. 4) */
function boiRatePercent_() {
  const raw = WORKER('rate?format=text');
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error('Invalid rate response');
  }
  return value;
}

/**
 * Current Bank of Israel policy rate (ריבית בנק ישראל), in percent (e.g. 4).
 *
 * @return {number} BOI rate as a number, not a decimal fraction.
 * @customfunction
 */
function BOI_RATE() {
  return boiRatePercent_();
}

/**
 * Current Israeli prime rate (ריבית פריים) = BOI rate + 1.5%, in percent.
 *
 * @return {number} Prime rate as a number (e.g. 5.5).
 * @customfunction
 */
function PRIME_RATE() {
  return boiRatePercent_() + 1.5;
}
