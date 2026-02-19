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

export function logisticPredict(values: number[], model: LogisticModel, scalers: Scalers): number {
  const order = model.feature_order;
  // Assume order === scalers.feature_order === input order
  const x = values.map((v, i) => {
    const std = scalers.stds[i] || 1;
    const mean = scalers.means[i] || 0;
    const s = std === 0 ? v - mean : (v - mean) / std;
    return s;
  });
  let z = model.intercept;
  for (let i = 0; i < x.length; i++) {
    z += (model.coefficients[i] || 0) * x[i];
  }
  return sigmoid(z);
}
