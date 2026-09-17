// All dimensions are entered in inches, per spec.
const IN_PER_FT = 12;

export function inchesToSqFt(lengthIn, widthIn) {
  return (lengthIn * widthIn) / (IN_PER_FT * IN_PER_FT);
}

export function inchesToCuFt(lengthIn, widthIn, thicknessIn) {
  return (lengthIn * widthIn * thicknessIn) / (IN_PER_FT * IN_PER_FT * IN_PER_FT);
}

/**
 * pricingMethod: "piece" | "sqft" | "cuft"
 * costRate / saleRate are per-unit-of-that-method (e.g. cost per sqft).
 * For "piece", rate is a flat per-piece amount and dimensions are informational only.
 */
export function calcCustomMattress({
  lengthIn, widthIn, thicknessIn, quantity = 1,
  pricingMethod = "sqft", costRate = 0, saleRate = 0
}) {
  const areaSqFt = inchesToSqFt(lengthIn, widthIn);
  const volumeCuFt = inchesToCuFt(lengthIn, widthIn, thicknessIn);

  let unitCost = 0, unitPrice = 0;
  if (pricingMethod === "piece") {
    unitCost = costRate;
    unitPrice = saleRate;
  } else if (pricingMethod === "sqft") {
    unitCost = costRate * areaSqFt;
    unitPrice = saleRate * areaSqFt;
  } else if (pricingMethod === "cuft") {
    unitCost = costRate * volumeCuFt;
    unitPrice = saleRate * volumeCuFt;
  }

  const totalCost = unitCost * quantity;
  const totalPrice = unitPrice * quantity;
  const profit = totalPrice - totalCost;
  const marginPercent = totalPrice > 0 ? (profit / totalPrice) * 100 : 0;

  return {
    areaSqFt: round2(areaSqFt),
    volumeCuFt: round2(volumeCuFt),
    unitCost: round2(unitCost),
    unitPrice: round2(unitPrice),
    totalCost: round2(totalCost),
    totalPrice: round2(totalPrice),
    profit: round2(profit),
    marginPercent: round2(marginPercent)
  };
}

export function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}
