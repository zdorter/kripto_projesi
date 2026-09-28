import { Candle, SwingPoint } from "../types";

export function candle(
  time: number,
  o: number,
  h: number,
  l: number,
  c: number,
  volume = 1000
): Candle {
  return { time, open: o, high: h, low: l, close: c, volume };
}

export function flatCandles(
  count: number,
  basePrice: number,
  step = 1
): Candle[] {
  const out: Candle[] = [];
  for (let i = 0; i < count; i++) {
    const p = basePrice + i * step * 0.01;
    out.push(candle(i, p, p + 0.5, p - 0.5, p));
  }
  return out;
}

export function swing(
  index: number,
  price: number,
  type: SwingPoint["type"],
  confirmed = true,
  strength = 80
): SwingPoint {
  return {
    index,
    time: index,
    price,
    type,
    strength,
    confirmed,
  };
}
