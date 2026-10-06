# EnergIA Sur — Backend

API y recolección de datos del monitor energético EnergIA Sur: lee un medidor
eléctrico Tuya, persiste las lecturas en Postgres, detecta anomalías, calcula
consumo, costo y proyección, y avisa por email.

**Este repo no tiene pantallas.** Expone 13 rutas HTTP bajo `/api` y una
función programada que recolecta cada 5 minutos. La interfaz vive en el repo
del frontend, que reenvía sus `/api/*` hacia este servicio.

Separado del repo monolítico `CristianSombra/energia_sur_mvp` (commit
`1a6c8e4cc35df109bb1d22bcf537e8fb757e0235`). El código de servidor se trasladó
sin cambios de comportamiento.

## Stack

- **Next.js 16** (App Router, solo route handlers) + **TypeScript**
- **Supabase (Postgres)** como base de datos
- **Tuya Cloud API** para la telemetría del medidor
- **Resend** para los avisos por email
- **Netlify** para el despliegue y la función programada

> Esta versión de Next.js tiene cambios incompatibles con lo que suele saberse
> de memoria (por ejemplo, `middleware.ts` pasó a llamarse `proxy.ts`). Ver
> `AGENTS.md`: consultar `node_modules/next/dist/docs/` antes de escribir
> código de Next.

## Qué problema resuelve

Un medidor eléctrico reporta lo que está pasando **ahora**: tensión, corriente,
potencia y un contador acumulado de energía. No guarda historia, no avisa de
nada y no dice cuánto va a costar la factura.

Este servicio toma esas lecturas cada pocos minutos y las convierte en las
cuatro cosas que un usuario necesita:

| Pregunta del usuario | Qué hace el sistema |
| --- | --- |
| ¿Cómo viene mi instalación ahora? | Lee el medidor en vivo y lo expone |
| ¿Cuánto gasté y cuánto me va a costar? | Calcula consumo real y lo valoriza con el cuadro tarifario |
| ¿Voy a llegar a fin de mes? | Proyecta el consumo y lo compara contra un objetivo |
| ¿Hubo algún problema eléctrico? | Detecta anomalías de tensión y corriente, y avisa por email |

## Arquitectura

### Dónde está parado este repo

```
Navegador
   │  (siempre habla con SU dominio: /api/...)
   ▼
FRONTEND (otro repo)  ──rewrite /api/*──►  BACKEND (este repo)
                                              │
                                              ├──► Supabase (Postgres)
                                              ├──► Tuya Cloud
                                              └──► Resend
```

El navegador nunca conoce la URL de este servicio: siempre pide `/api/...` a su
propio dominio y el frontend lo reenvía del lado del servidor. Por eso acá **no
hay CORS** y la cookie de sesión viaja sola.

### Cómo está organizado por dentro

Arquitectura hexagonal: la lógica de negocio no sabe que existen Supabase, Tuya
ni Resend. Les habla a través de **puertos** —interfaces que describen qué
necesita, no cómo se hace— y los **adaptadores** los implementan del otro lado.

```
src/
  domain/          ← las reglas del negocio. No importa infraestructura.
  infrastructure/  ← los adaptadores. Lo único que menciona Supabase/Tuya/Resend.
  lib/             ← acceso a datos, configuración y puntos de entrada.
  app/api/         ← las 13 rutas HTTP.
```

La dependencia apunta siempre hacia adentro: `app/api` → `lib` →
`infrastructure` → `domain`. El dominio no depende de nadie.

**Por qué importa, en concreto:** las reglas de detección de anomalías se
prueban hoy con un array de lecturas y nada más. Antes del refactor, el mismo
test necesitaba reemplazar tres módulos de base de datos. Comparar
`tests/anomaly-rules.test.ts` con `tests/anomalies.test.ts` muestra la
diferencia.

#### `src/domain` — las reglas

Funciones puras: mismas entradas, mismas salidas, sin tocar la base, la red ni
el reloj.

| Archivo | Qué decide |
| --- | --- |
| `anomaly-rules.ts` | Qué es una anomalía: umbrales, histéresis, agrupación, severidad, huecos |
| `detect-anomalies.ts` | Caso de uso: pide por los puertos, decide con las reglas, aplica el plan |
| `meter-sampling.ts` | Cuándo toca guardar una lectura y cómo se interpreta la respuesta cruda del medidor |
| `read-meter.ts` | Caso de uso: leer el medidor y persistir si corresponde |
| `notify-anomalies.ts` | Qué eventos merecen un aviso y cuándo un envío cierra el asunto |
| `tariffs.ts` | Cuadro tarifario SPSE y cálculo del costo de energía |
| `goal.ts` | Objetivo mensual: conversión pesos ↔ kWh, avance, desvío y proyección |
| `forecast.ts` | Proyección de consumo y niveles de confianza |
| `recommendations.ts` | Sugerencias derivadas de las mediciones |
| `periods.ts`, `ranges.ts` | Períodos de consulta y tamaño de cubeta del histórico |
| `phase-a.ts` | Decodificador del data point crudo del medidor |
| `ports.ts` | Los contratos con el exterior: lecturas, eventos, medidores, dispositivo, correo |

#### `src/infrastructure` — los adaptadores

Dos archivos, 95 líneas. Son los únicos de todo el camino de negocio que
mencionan Supabase, Tuya o Resend. Cambiar de base de datos se resolvería acá
sin tocar una sola regla.

#### `src/lib` — acceso a datos y entrada

Las consultas a Supabase (`readings`, `events`, `meters`, `profiles`, `home`),
los clientes externos (`supabase`, `tuya`, `mailer`), la configuración (`env`) y
los puntos de entrada delgados (`anomalies`, `meter-reading`, `notify`) que le
enchufan los adaptadores al dominio y mantienen las firmas que usan las rutas.

#### `src/app/api` — las rutas

Adaptadores HTTP: validan parámetros, llaman al caso de uso y arman la
respuesta. Las 13 rutas y sus formatos son el contrato con el frontend y están
fijados por tests.

```
supabase/migrations/     Esquema SQL (0001 a 0014)
netlify/functions/
  collect-reading.mts    Recolector programado (cron cada 5 min = piso)
tests/                   171 tests, sin dependencias externas
```

Algunos archivos de `src/domain` los usa también el frontend (constantes y
tipos como `collection-intervals`, `home-catalog`, `event-types`, `periods`,
`ranges`). Hoy están **duplicados** en los dos repos: si se toca una de esas
constantes, hay que tocarla en ambos. En particular, si el frontend ofrece un
aparato cuyo id este backend no conoce, `/api/meter/home` lo descarta en
silencio al guardar.

## Tests

```bash
npm test          # 171 tests
npm run typecheck # tipos del código y de los tests
npm run lint
```

Corren con el runner nativo de Node 24, **sin dependencias de testing**.
`tests/_resolver.mjs` traduce en memoria los imports del código a lo que exige
Node, así los tests se ejecutan sobre el código real sin compilarlo.

Qué cubren: el contrato de las 13 rutas (que el frontend no se rompa), las
reglas de anomalías, el objetivo mensual, la proyección, el cuadro tarifario,
el decodificador del medidor y las decisiones de muestreo y aviso.

## Contrato de la API

El frontend depende de esto: rutas, métodos, formato de respuesta y códigos
HTTP **no pueden cambiar** sin coordinar con el otro repo.

| Ruta | Métodos | Autenticación |
| --- | --- | --- |
| `/api/meter/live` | GET | sesión + medidor |
| `/api/meter/history` | GET | sesión + medidor |
| `/api/meter/forecast` | GET | sesión + medidor |
| `/api/meter/events` | GET | sesión + medidor |
| `/api/meter/event-series` | GET | sesión + medidor |
| `/api/meter/consumption` | GET | sesión + medidor |
| `/api/meter/collector-status` | GET | sesión + medidor |
| `/api/meter/goal` | PUT | sesión + medidor |
| `/api/meter/home` | GET, PUT | sesión + medidor |
| `/api/meter/settings` | GET, PUT | sesión + medidor |
| `/api/meters` | GET | sesión |
| `/api/profile` | GET, PUT | sesión |
| `/api/meter/collect` | POST | secreto `x-collector-secret` |

Sin sesión, las 12 rutas de usuario responden `401 {"error":"No autenticado."}`
cualquiera sea el método. La sesión se valida **antes** que los parámetros, así
que `event-series` sin parámetros también responde 401.
`collect` sin secreto o con secreto incorrecto responde
`401 {"error":"No autorizado."}`.

## Sesión y cookies

El login lo hace el navegador contra Supabase Auth y guarda la sesión en una
cookie (`sb-<ref>-auth-token`). Cada ruta lee esa cookie con `getCurrentUser()`
(`auth.ts` → `supabase-server.ts`) y valida la sesión consultando a Supabase
con la clave anónima. `requireMeter()` resuelve además qué medidor le
corresponde a esa cuenta.

**Este backend nunca escribe cookies:** `supabase-server.ts` omite `setAll` a
propósito. El refresco de la sesión lo hace el `proxy.ts` del frontend, al
navegar páginas. Por eso cada ruta repite el chequeo por su cuenta — la
documentación de Next.js 16 advierte explícitamente contra confiar solo en
Proxy, porque un matcher mal ajustado puede dejar una ruta sin cobertura.

La tabla `meters` (`device_id → owner_id`) es la fuente de verdad de qué
medidor le pertenece a quién, y `meter_members` agrega las cuentas invitadas a
verlo. RLS está activo y sin políticas: ninguna consulta con la clave pública
puede leerla directamente; el servidor resuelve el dueño con la service role
key y filtra en código.

## Puesta en marcha

### 1. Dependencias

```bash
npm install
```

### 2. Base de datos

Para levantar un proyecto Supabase desde cero, ejecutar las migraciones en
orden en el SQL Editor, de `supabase/migrations/0001_readings.sql` a
`0014_meter_members.sql`:

| Archivo | Qué agrega |
| --- | --- |
| `0001_readings.sql` | tabla `readings`, su índice y las funciones `reading_series` y `reading_summary` |
| `0002_period_consumption.sql` | función `period_consumption`, para el consumo del período |
| `0003_reading_source.sql` | columna `source`, distingue lecturas del dashboard de las del recolector |
| `0004_meters.sql` | tabla `meters`, vincula cada medidor a la cuenta de su dueño |
| `0005_events.sql` | tabla `events` y umbrales de detección por medidor |
| `0006_collection_interval.sql` | intervalo de guardado configurable por medidor |
| `0007_forecast.sql` | funciones `forecast_basis` y `hourly_profile` |
| `0008_profiles.sql` | tabla `profiles` con los datos del titular |
| `0009_goal.sql` | objetivo mensual de consumo por medidor |
| `0010_daily_energy.sql` | función `daily_energy`, para el avance del objetivo |
| `0011_alerts.sql` | preferencia de avisos y marca de notificación de cada evento |
| `0012_event_time_order.sql` | restricción: un evento no puede terminar antes de empezar |
| `0013_home_context.sql` | contexto del hogar: vivienda, ambientes y aparatos |
| `0014_meter_members.sql` | acceso compartido a un medidor sin ser su dueño |

En **Authentication → Sign In / Providers → Email**, desactivar **"Confirm
email"**: no hay proveedor de correo configurado para el alta.

### 3. Variables de entorno

Copiar `.env.example` a `.env.local` y completar. **No commitear valores
reales.**

| Variable | Dónde se obtiene | Secreta |
| --- | --- | --- |
| `TUYA_CLIENT_ID` | Tuya IoT Platform → Cloud → proyecto → *Access ID* | sí |
| `TUYA_CLIENT_SECRET` | Tuya IoT Platform → Cloud → proyecto → *Access Secret* | sí |
| `TUYA_BASE_URL` | Región del proyecto Tuya (por defecto `openapi.tuyaus.com`) | no |
| `SUPABASE_URL` | Supabase → Project Settings → API → *Project URL* | no |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → *service_role* | **sí** |
| `NEXT_PUBLIC_SUPABASE_URL` | Igual a `SUPABASE_URL` — se usa para validar la sesión | no |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API → *Publishable key* | no |
| `COLLECTOR_SECRET` | Se genera; ver `.env.example`. **Ver "Un solo recolector"** | sí |
| `RESEND_API_KEY` | Opcional — resend.com → API Keys. Sin ella no se envían avisos | sí |
| `ALERT_EMAIL_FROM` | Opcional — remitente verificado en Resend | no |
| `ALERT_EMAIL_TO` | Opcional — casilla única que recibe todos los avisos | no |
| `FRONTEND_URL` | Base del link "Ver el detalle" de los mails | no |
| `URL` | La define Netlify sola — **no cargarla a mano** | — |

Ninguna variable tiene valor por defecto: si falta alguna, la ruta lo informa
nombrando cuáles, en vez de apuntar en silencio a un recurso equivocado. El
device id de cada medidor **no** es una variable de entorno: se vincula a una
cuenta en la tabla `meters`.

Los nombres `NEXT_PUBLIC_*` se mantienen aunque acá se lean solo en el
servidor: renombrarlas rompería `env-public.ts`.

`SUPABASE_SERVICE_ROLE_KEY` evita RLS y da acceso total a la base. Solo se usa
en el servidor y **nunca** debe viajar al repo del frontend, igual que las
claves de Tuya y de Resend.

`FRONTEND_URL` es la única variable que no existía en el repo original: los
mails de alerta llevan un link "Ver el detalle" que antes apuntaba a la URL del
propio sitio. Como este servicio no tiene pantallas, el link tiene que apuntar
al frontend. Si no se define, se usa `URL` igual que antes.

### Vincular un medidor a una cuenta

No hay autoservicio de alta: es una operación manual por SQL.

```sql
insert into public.meters (device_id, owner_id, name)
values (
  'el-device-id-del-medidor',
  (select id from auth.users where email = 'el-email-de-la-cuenta@ejemplo.com'),
  'Oficina'
);
```

Sin un medidor vinculado la cuenta inicia sesión con normalidad, pero las rutas
de medidor responden que todavía no tiene uno, en vez de datos de otra persona
o valores inventados.

### 4. Desarrollo

```bash
npm run dev
```

Para probar un build de producción con las variables cargadas en memoria, sin
escribir ningún archivo:

```bash
set -a; source .env.local; set +a; npx next start -p 3200
```

## Flujo de datos

1. El frontend consulta `/api/meter/live` cada 5 segundos mientras alguien
   tiene el sitio abierto.
2. La ruta pide a Tuya el estado del dispositivo y sus data points.
3. `phase_a` se decodifica en tensión, corriente y potencia; la energía
   acumulada sale de `total_forward_energy`.
4. La lectura se guarda en Supabase en una cubeta de 5 segundos: si el sondeo
   llega más seguido, actualiza la fila en lugar de duplicarla.
5. `/api/meter/history` devuelve la serie ya agregada por Postgres según el
   rango pedido, más un resumen del período.

### Criterios de datos

- Tensión, corriente, potencia y energía acumulada provienen del medidor.
- Frecuencia y factor de potencia no se exponen: el medidor no los publica y no
  se estiman.
- Cuando falta un valor se devuelve `null`, nunca cero.
- La agregación del histórico se resuelve en SQL, no trayendo filas a Node.

## Consumo y costo

`/api/meter/consumption` calcula el consumo real del período como la diferencia
entre la energía acumulada que reporta el medidor al inicio y al final del
rango — no integra potencia entre lecturas, que sería una aproximación; el
medidor ya expone un contador acumulado real.

- **Categoría tarifaria:** Residencial sin subsidio (cuadro SPSE), confirmada
  para el domicilio de este medidor.
- **Alcance:** solo cargo de energía. Agua, cloaca y alumbrado quedan fuera por
  decisión explícita, no por omisión — ver `src/lib/tariffs.ts`.
- **Cargo fijo:** es mensual; se prorratea según los días reales del período
  (`cargoFijo × días / 30`).
- **Si no hay al menos dos lecturas en el período**, o el contador de energía
  retrocedió (medidor reiniciado o reemplazado), no se estima nada: la
  respuesta explica por qué en vez de devolver un número inventado.

## Detección de anomalías

Corre en cada ciclo del recolector (cada 5 minutos), **sobre la serie ya
persistida** — no sobre la muestra recién tomada. Así también evalúa las
lecturas que escribió el sondeo del frontend entre dos ciclos.

| Tipo | Condición | Umbral por defecto |
| --- | --- | --- |
| Tensión baja | Tensión por debajo del umbral | 202,4 V |
| Tensión alta | Tensión por encima del umbral | 237,6 V |
| Sobrecorriente | Corriente por encima del umbral | 15 A |
| Sin lecturas | Intervalo sin ninguna lectura | 15 min |

Los umbrales de tensión son la tolerancia de ±8% sobre 220 V nominales que
aplica ENRE a usuarios de baja tensión. Viven en la tabla `meters`, uno por
medidor, y se ajustan por SQL.

> El umbral de sobrecorriente (15 A) es **provisorio**: hay que confirmarlo
> contra la capacidad real de la instalación antes de confiar en esas alertas.

**Agrupación.** Un evento agrupa lecturas consecutivas que violan la misma
condición, en vez de emitir una alerta por muestra. Para abrirlo alcanza con
cruzar el umbral; para cerrarlo hay que recuperarse **con margen** (2 V de
histéresis, 0,5 A en corriente). Esa banda muerta es lo que evita el ruido: con
una tensión oscilando alrededor del umbral —justo lo que hace una red al
límite— sin histéresis un mismo episodio se fragmentaría en decenas de eventos
de un par de segundos. Es el mismo criterio con el que trabajan los relés de
protección.

Un evento se cierra en el instante de su **última lectura en falta**, no cuando
se detecta: así la duración refleja cuánto duró la anomalía real.

**Reentrancia.** Cada medidor guarda hasta qué instante ya se evaluaron sus
lecturas (`meters.anomalies_evaluated_at`). Correr la detección dos veces no
reprocesa historia ni duplica eventos; un índice único parcial garantiza además,
a nivel de base, un solo evento abierto por tipo y medidor.

**Sobre "Sin lecturas".** Un hueco en la serie puede deberse a un corte de
suministro, a que el medidor perdió conexión, o a una interrupción del
monitoreo. **Con estos datos no se puede distinguir cuál**, y la respuesta lo
dice así en vez de afirmar que hubo un corte.

## Proyección

`/api/meter/forecast` estima consumo y costo para los próximos 30 días
extrapolando el promedio diario medido.

El insumo es la diferencia entre la energía acumulada al inicio y al final de la
serie. Como el medidor lleva un **contador acumulado**, esa diferencia captura
todo el consumo del período aunque no se haya muestreado en el medio: por eso
guardar cada 5 minutos en vez de cada 5 segundos no degrada la proyección. Lo
que importa es cuántos **días** abarca la serie, no cada cuánto se muestrea.

| Span | Confianza | Por qué |
| --- | --- | --- |
| < 1 día | *no se proyecta* | La muestra no cubre ni un ciclo diario completo; extrapolarla a un mes multiplicaría por 30 el sesgo de esa franja horaria |
| 1 a 3 días | Baja | Un día atípico distorsiona el promedio |
| 3 a 14 días | Media | Cubre varios días, pero no la diferencia entre semana y fin de semana |
| ≥ 14 días | Alta | Incluye al menos dos semanas completas |

Tampoco se proyecta si el contador de energía retrocedió. El **perfil por hora
del día** exige al menos 3 días con lecturas; por debajo de eso sería el
retrato de una sola jornada presentado como curva típica, así que la respuesta
lo marca como deshabilitado en vez de devolverlo.

La proyección asume que el uso se mantiene parecido: no anticipa cambios de
hábitos, de estación ni equipos nuevos.

## Alertas por email

Cuando se abre una anomalía de severidad advertencia o crítica, se envía un
correo. Los eventos informativos (huecos cortos de datos) no avisan: llenar la
casilla de ruido es la forma más rápida de que se ignoren también los avisos
que importan.

El envío ocurre al final de cada ciclo del recolector, después de detectar.
`events.notified_at` marca lo ya avisado, así que un envío fallido se reintenta
en el ciclo siguiente en vez de perderse, y una cola larga se manda de a cinco
por ciclo para no disparar una avalancha.

Sin `RESEND_API_KEY`, `ALERT_EMAIL_FROM` o `ALERT_EMAIL_TO` el servicio
funciona igual: las anomalías se detectan y se registran, solo que no se envía
el correo. Quedarse sin avisar es molesto; cortar la recolección de datos por
no poder mandar un mail sería peor.

El aviso va a una única casilla (`ALERT_EMAIL_TO`), no al email de login de cada
cuenta con acceso al medidor: quién puede ENTRAR a verlo (`meter_members`) y
quién se ENTERA de un problema son cosas separadas a propósito. Con el dominio
de prueba de Resend (sin verificar uno propio), la única casilla a la que se
puede entregar es la del email con el que se creó la cuenta de Resend — por eso
conviene que sea la misma que `ALERT_EMAIL_TO`.

Cada medidor tiene su interruptor, que el frontend maneja por
`PUT /api/meter/settings`.

## Recolección del histórico

El histórico se puebla por dos caminos que conviven:

- **Sondeo del frontend** — consulta `/api/meter/live` cada 5 segundos mientras
  alguien tiene el sitio abierto.
- **Recolector programado** — `netlify/functions/collect-reading.mts`, una
  scheduled function de Netlify que corre con independencia de que haya un
  navegador abierto. Es lo que garantiza que el histórico no tenga huecos de
  noche o con el sitio cerrado. Lee **todos** los medidores de la tabla
  `meters`, no uno fijo.

Cada lectura guarda su `source` (`dashboard` o `scheduled`), que es lo que usa
`/api/meter/collector-status` para informar, de forma verificable, que la
recolección automática está corriendo.

El recolector no lee el medidor por su cuenta: invoca
`POST /api/meter/collect` sobre su propio sitio (`${URL}/api/meter/collect`),
que concentra la lógica de lectura y persistencia (`src/lib/meter-reading.ts`,
compartida con `/api/meter/live`). Así hay una sola implementación, y la función
programada no necesita credenciales de Tuya ni de Supabase — solo
`COLLECTOR_SECRET`. La ruta exige ese secreto en el header
`x-collector-secret` y lo compara de forma timing-safe. Es POST porque escribe.

### Frecuencia de guardado

Consultar el medidor y guardar la lectura son dos cosas distintas: el frontend
se actualiza cada 5 segundos, pero **cuánto se persiste** lo decide
`meters.collection_interval_minutes` (5 min a 1 día), que se configura por
`PUT /api/meter/settings`.

Cada origen lleva su propio ritmo: con 5 minutos configurados se guardan como
máximo 2 filas cada 5 minutos (una del recolector, una del frontend si está
abierto). Sin este control, el sondeo escribía una fila cada 5 segundos — unas
17.000 por día, que en el plan gratuito de Supabase (500 MB) es insostenible.

El cron de Netlify corre cada 5 minutos y es el **piso**: los intervalos más
largos se cumplen salteando ciclos, y un medidor que todavía no cumplió el suyo
se saltea sin llamar a Tuya ni a la base. Por eso `BASE_CRON_MINUTES` en
`src/lib/collection-intervals.ts` debe coincidir con el `schedule` de
`netlify/functions/collect-reading.mts`.

### Un solo recolector a la vez

La base es compartida con el sitio original mientras dure la transición. Si
**los dos** sitios tienen el recolector activo, ambos leen el medidor y
escriben en la misma base: lecturas duplicadas y posibles avisos repetidos.

**Regla: en todo momento hay exactamente un recolector activo.**

Un recolector queda *inerte* simplemente **no definiendo `COLLECTOR_SECRET`**
en ese sitio: la función registra "Falta COLLECTOR_SECRET…" y no hace nada, y
`/api/meter/collect` rechaza las llamadas. No requiere tocar código.

Por eso este servicio se despliega **sin `COLLECTOR_SECRET`**, y se activa
recién en el corte, en el mismo momento en que se lo quita del sitio original.

## Despliegue

Netlify, en un sitio propio y aparte del sitio original. Al crearlo:

1. Cargar las variables de entorno de la tabla de arriba, **excepto
   `COLLECTOR_SECRET`** (ver "Un solo recolector a la vez").
2. No cargar `URL`: la define Netlify.
3. Verificar en el log de la función programada que informa la falta de
   `COLLECTOR_SECRET` y no recolecta.

Node usado en desarrollo: v24.18.0. Si el build remoto falla por la versión,
fijarla con `.nvmrc` o la variable `NODE_VERSION`.

## Comandos

```bash
npm run dev        # desarrollo
npm test           # los 171 tests
npm run typecheck  # tipos del código y de los tests
npm run lint       # eslint
npm run build      # build de producción
```

## Limitaciones conocidas

- **Constantes duplicadas** entre este repo y el del frontend (ver
  *Arquitectura*). Resolverlo con un paquete compartido es una mejora futura.
- **Un solo medidor por cuenta.** `requireMeter()` resuelve el primero; el
  esquema ya soporta varios y el panel los lista, pero las rutas de medidor
  todavía no reciben cuál.
- **Alta de medidores manual**, por SQL. No hay autoservicio.
- **El umbral de sobrecorriente (15 A) es provisorio**: hay que confirmarlo
  contra la capacidad real de la instalación antes de confiar en esas alertas.
- **Etapa 6 del proyecto** (asistente conversacional) pendiente.
- Si Tuya deja de responder (por ejemplo con la suscripción de IoT Core
  vencida, error `28841002`), `/api/meter/live` y la recolección devuelven
  `502`. El resto de las rutas no depende de Tuya.
