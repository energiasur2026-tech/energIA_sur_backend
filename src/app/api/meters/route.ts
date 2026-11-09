import { NextResponse } from 'next/server';
import { apiError } from '@/lib/api-error';

import { summarizeHome } from '@/domain/home-types';
import { buildGoalProgress, monthBoundsArgentina } from '@/domain/goal';
import { supabaseRepositories as repos } from '@/infrastructure/supabase-repositories';
import {
  canUnlink,
  parseDeviceId,
  parseMeterName,
  DEVICE_ID_ERROR_MESSAGE,
} from '@/domain/device-linking';
import { isValidPhases } from '@/domain/installation-types';
import { deviceExists } from '@/lib/tuya';

/**
 * El contexto del hogar es informacion complementaria de la tarjeta: si no se
 * puede leer, mostrar los medidores sin ese dato es muchisimo mejor que no
 * mostrar nada. El caso concreto que esto cubre es tener el codigo desplegado
 * y la migracion 0013 todavia sin correr, que dejaria la pantalla entera en
 * error por una seccion opcional.
 *
 * El error se registra igual, para que un problema real no quede invisible.
 */
async function safeHomeContext(deviceId: string) {
  try {
    return await repos.home.get(deviceId);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`[api/meters] contexto del hogar de ${deviceId}: ${detail}`);
    return null;
  }
}

/**
 * Resumen de los medidores del usuario, uno por tarjeta.
 *
 * Lee de la base y no de Tuya: esta pantalla es un panorama, no un tablero en
 * vivo. Consultar el dispositivo de cada medidor acá multiplicaría las
 * llamadas a Tuya por la cantidad de medidores cada vez que alguien entra.
 */
export async function GET() {
  try {
    const user = await repos.session.currentUser();
    if (!user) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

    const meters = await repos.meters.forOwner(user.id);
    const now = new Date();
    const { start: monthStart } = monthBoundsArgentina(now);

    const summaries = await Promise.all(
      meters.map(async (meter) => {
        const [latest, monthConsumption, activeEvents, home] = await Promise.all([
          repos.readings.latest(meter.deviceId),
          repos.readings.periodConsumption(meter.deviceId, monthStart, now),
          repos.events.countActive(meter.deviceId),
          safeHomeContext(meter.deviceId),
        ]);

        const consumedThisMonth =
          monthConsumption.samples >= 2 &&
          monthConsumption.firstEnergy !== null &&
          monthConsumption.lastEnergy !== null &&
          monthConsumption.lastEnergy >= monthConsumption.firstEnergy
            ? monthConsumption.lastEnergy - monthConsumption.firstEnergy
            : null;

        return {
          deviceId: meter.deviceId,
          name: meter.name,
          // Sin esto la tarjeta no puede distinguir un medidor del tablero de
          // uno de área, que es justo lo que cambia cómo se presenta.
          role: meter.role,
          areaLabel: meter.areaLabel,
          phases: meter.phases,
          latest,
          activeEvents,
          home: summarizeHome(home),
          goal: buildGoalProgress({
            goalKwh: meter.goalKwh,
            inputMode: meter.goalInputMode,
            consumedKwh: consumedThisMonth,
            measuredFrom: monthConsumption.firstAt,
            measuredTo: monthConsumption.lastAt,
            now,
          }),
        };
      })
    );

    return NextResponse.json({ meters: summaries });
  } catch (error) {
    return apiError('api/meters', error);
  }
}

/**
 * Vincula un medidor a la cuenta de la sesión.
 *
 * Reemplaza al alta manual por SQL. Tres validaciones, en este orden, porque
 * cada una evita trabajo de la siguiente:
 *
 * 1. **Forma del identificador.** Barata y local.
 * 2. **Que no esté ya vinculado.** Una consulta. Se responde 409 sin decir a
 *    quién pertenece: confirmarle a un desconocido que cierto identificador
 *    existe y está tomado ya es información de más.
 * 3. **Que el dispositivo exista en Tuya.** Es la cara, pero es la que impide
 *    reclamar identificadores inventados y llenar la tabla de medidores
 *    fantasma.
 *
 * El identificador funciona como un secreto compartido: está impreso en el
 * equipo y no se publica. No es un emparejamiento fuerte —Tuya no da un
 * código rotativo que se muestre en el dispositivo— y conviene saberlo.
 */
export async function POST(request: Request) {
  try {
    const user = await repos.session.currentUser();
    if (!user) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

    const body = (await request.json().catch(() => null)) as {
      deviceId?: unknown;
      name?: unknown;
      phases?: unknown;
    } | null;

    const id = parseDeviceId(body?.deviceId);
    if (!id.ok) {
      return NextResponse.json({ error: DEVICE_ID_ERROR_MESSAGE[id.error] }, { status: 400 });
    }

    if (body?.phases !== undefined && !isValidPhases(body.phases)) {
      return NextResponse.json(
        { error: 'El equipo debe ser monofásico (1) o trifásico (3).' },
        { status: 400 }
      );
    }

    if (await repos.meters.isLinked(id.deviceId)) {
      return NextResponse.json(
        { error: 'Ese medidor ya está vinculado a una cuenta.' },
        { status: 409 }
      );
    }

    // Si Tuya no lo conoce, no es un medidor de este sistema. Un fallo de
    // comunicación con Tuya cae en `apiError` como 502, que es distinto de
    // "no existe": uno se reintenta, el otro no.
    const existe = await deviceExists(id.deviceId);
    if (!existe) {
      return NextResponse.json(
        { error: 'No encontramos ese medidor. Revisá el identificador.' },
        { status: 404 }
      );
    }

    const meter = await repos.meters.link({
      deviceId: id.deviceId,
      ownerId: user.id,
      name: parseMeterName(body?.name),
      phases: isValidPhases(body?.phases) ? body.phases : 1,
    });

    return NextResponse.json(
      {
        meter: {
          deviceId: meter.deviceId,
          name: meter.name,
          role: meter.role,
          areaLabel: meter.areaLabel,
          phases: meter.phases,
        },
        /**
         * Lecturas que ya existían de este medidor. Mayor que cero significa
         * que se está recuperando un medidor desvinculado antes, con toda su
         * historia.
         */
        existingReadings: await repos.meters.countReadings(meter.deviceId),
      },
      { status: 201 }
    );
  } catch (error) {
    return apiError('api/meters', error);
  }
}

/**
 * Desvincula un medidor de la cuenta.
 *
 * Solo el dueño puede. Un invitado que quiere dejar de ver un medidor no se
 * lo saca a quien lo instaló.
 *
 * **Las lecturas y los eventos quedan**: `readings` no depende de `meters`,
 * así que volver a vincular el mismo medidor recupera su historia entera. Lo
 * que se pierde es la configuración —el contexto del lugar, sus
 * subdivisiones, los aparatos y las cuentas invitadas—, que dependen del
 * medidor con borrado en cascada. La respuesta lo informa para que la
 * pantalla pueda advertirlo ANTES, no después.
 */
export async function DELETE(request: Request) {
  try {
    const user = await repos.session.currentUser();
    if (!user) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

    const id = parseDeviceId(new URL(request.url).searchParams.get('deviceId'));
    if (!id.ok) {
      return NextResponse.json({ error: DEVICE_ID_ERROR_MESSAGE[id.error] }, { status: 400 });
    }

    const access = await repos.meters.accessLevel(user.id, id.deviceId);

    // Un medidor que no es suyo y uno que no existe se responden igual: si
    // difirieran, probar identificadores diría cuáles están tomados.
    if (access === 'none') {
      return NextResponse.json({ error: 'Medidor no encontrado.' }, { status: 404 });
    }

    if (!canUnlink(access)) {
      return NextResponse.json(
        { error: 'Solo quien vinculó el medidor puede desvincularlo.' },
        { status: 403 }
      );
    }

    const readings = await repos.meters.countReadings(id.deviceId);
    await repos.meters.unlink(id.deviceId);

    return NextResponse.json({
      unlinked: id.deviceId,
      /** Las mediciones sobreviven; volver a vincularlo las recupera. */
      keptReadings: readings,
    });
  } catch (error) {
    return apiError('api/meters', error);
  }
}
