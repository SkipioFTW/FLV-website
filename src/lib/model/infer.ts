export function logisticPredict(values: number[], model: {
  type: string;
  intercept?: number;
  coefficients?: number[];
  teams?: Record<number, { rating_b: number; strength_s: number }>;
  alpha?: number;
  std_x?: number;
}, scalers: {
  means?: number[];
  stds?: number[];
}, t1?: number, t2?: number): number {
  if (model.type === 'b_ratings' && t1 !== undefined && t2 !== undefined) {
    const teams = model.teams || {};
    const b1 = teams[t1]?.rating_b || 0;
    const b2 = teams[t2]?.rating_b || 0;
    const delta = b1 - b2;
    const alpha = model.alpha || 1.5;
    const std_x = model.std_x || 10.0;
    const x_prime = delta / std_x;
    return sigmoid(x_prime * alpha);
  }

  if (model.type === 'logistic_v5' || model.type === 'logistic_v4') {
    const x = values.map((v, i) => {
      const std = scalers.stds?.[i] || 1;
      const mean = scalers.means?.[i] || 0;
      const s = std === 0 ? v - mean : (v - mean) / std;
      return s;
    });
    let z = model.intercept || 0;
    for (let i = 0; i < x.length; i++) {
      z += (model.coefficients?.[i] || 0) * x[i];
    }
    return sigmoid(z);
  }

  const x = values.map((v, i) => {
    const std = scalers.stds?.[i] || 1;
    const mean = scalers.means?.[i] || 0;
    const s = std === 0 ? v - mean : (v - mean) / std;
    return s;
  });
  let z = model.intercept || 0;
  for (let i = 0; i < x.length; i++) {
    z += (model.coefficients?.[i] || 0) * x[i];
  }
  return sigmoid(z);
}

function sigmoid(z: number) {
  return 1 / (1 + Math.exp(-z));
}
