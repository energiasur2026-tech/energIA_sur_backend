export interface PhaseAReading {
  voltage: number | null;
  current: number | null;
  powerW: number | null;
}

/**
 * Decodifica el string base64 que el medidor Tuya reporta en el data point `phase_a`.
 *
 * Estructura del buffer (big-endian):
 *   bytes 0-1  Tension        · uint16 · escala 0.1 V   (0x085C = 2140 -> 214.0 V)
 *   bytes 2-4  Corriente      · uint24 · escala 0.001 A (0x000064 = 100 -> 0.100 A)
 *   bytes 5-7  Potencia activa· uint24 · escala 1 W     (0x000013 = 19 -> 19 W)
 *   bytes 8-9  Reservado — el dispositivo reporta 0x0000; no se interpreta.
 *
 * Frecuencia y factor de potencia no se derivan de este DP: el medidor no los
 * publica y no se estiman, para no mostrar valores inventados.
 */
export function decodePhaseA(rawBase64: string | null): PhaseAReading {
  const empty: PhaseAReading = { voltage: null, current: null, powerW: null };
  if (!rawBase64) return empty;

  try {
    const buffer = Buffer.from(rawBase64, 'base64');
    if (buffer.length < 8) return empty;

    const rawVoltage = buffer.readUInt16BE(0);
    const rawCurrent = buffer.readUIntBE(2, 3);
    const rawPower = buffer.readUIntBE(5, 3);

    return {
      voltage: rawVoltage > 0 ? round(rawVoltage * 0.1, 1) : null,
      current: round(rawCurrent * 0.001, 3),
      powerW: rawPower,
    };
  } catch {
    return empty;
  }
}

function round(value: number, decimals: number) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
