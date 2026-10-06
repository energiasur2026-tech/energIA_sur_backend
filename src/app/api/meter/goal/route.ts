import { NextResponse } from 'next/server';
import { isErrorResponse, requireMeter } from '@/lib/api-auth';
import { apiError } from '@/lib/api-error';
import { budgetToKwh, kwhToBudget, type GoalInputMode } from '@/domain/goal';
import { setGoal } from '@/lib/meters';

/** Techo sensato para una vivienda: por encima, casi seguro es un error de tipeo. */
const MAX_GOAL_KWH = 20000;

/**
 * Fija la meta mensual.
 *
 * Acepta el valor en kWh o en pesos. En pesos se convierte a kWh con el
 * cuadro tarifario antes de guardar: la meta siempre se persiste en la unidad
 * que el medidor mide, y el modo elegido solo se recuerda para mostrarla
 * después en los mismos términos en que la pensó el usuario.
 */
export async function PUT(request: Request) {
  try {
    const auth = await requireMeter();
    if (isErrorResponse(auth)) return auth;

    const body = (await request.json().catch(() => null)) as {
      mode?: unknown;
      value?: unknown;
    } | null;

    const mode: GoalInputMode = body?.mode === 'ars' ? 'ars' : 'kwh';

    // `null` borra el objetivo.
    if (body?.value === null) {
      await setGoal(auth.meter.deviceId, null, mode);
      return NextResponse.json({ goalKwh: null, goalCostArs: null, inputMode: mode });
    }

    const value = Number(body?.value);
    if (!Number.isFinite(value) || value <= 0) {
      return NextResponse.json({ error: 'Ingresá un número mayor a cero.' }, { status: 400 });
    }

    const goalKwh = mode === 'ars' ? budgetToKwh(value) : value;

    if (goalKwh === null) {
      return NextResponse.json(
        {
          error:
            'Ese importe no alcanza a cubrir el cargo fijo de la tarifa, así que no corresponde a ningún consumo posible.',
        },
        { status: 400 }
      );
    }

    if (goalKwh <= 0 || goalKwh > MAX_GOAL_KWH) {
      return NextResponse.json(
        { error: `El objetivo debe estar entre 1 y ${MAX_GOAL_KWH.toLocaleString('es-AR')} kWh.` },
        { status: 400 }
      );
    }

    await setGoal(auth.meter.deviceId, goalKwh, mode);

    return NextResponse.json({
      goalKwh,
      goalCostArs: kwhToBudget(goalKwh),
      inputMode: mode,
    });
  } catch (error) {
    return apiError('api/meter/goal', error);
  }
}
