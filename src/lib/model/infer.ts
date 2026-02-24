export type LogisticModel = {
  intercept: number;
  coefficients: number[]; // aligned with feature order
  feature_order: string[];
};

export type Scalers = {
  means: number[];
  stds: number[];
  feature_order: string[];
};

function sigmoid(z: number) {
  return 1 / (1 + Math.exp(-z));
}

export function logisticPredict(values: number[], model: any, scalers: any, t1?: number, t2?: number): number {
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

  const order = model.feature_order || [];
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
