# SPSE · revisión de la factura de referencia «10/26»

Revisión: 11/11/2026. No contiene identificadores personales de la factura. Fuente de la liquidación: documento aportado por el usuario; fuente pública: https://spse.ar/atencion-cliente#calcularConsumo .

## Conceptos identificados

| Código / concepto | Importe ARS | Alcance del cálculo del hogar |
| --- | ---: | --- |
| 301 Servicio de energía · 214 kWh | 33.747,85 | Cargo eléctrico combinado; documento no separa fijo y variable |
| 303 Servicio de agua | 15.000,00 | Excluido; servicio independiente |
| 381 Servicio de energía pública | 10.500,00 | Excluido; conservar denominación exacta, no atribuirle kWh del medidor doméstico |
| Subtotal | 59.247,85 | Suma de los tres servicios; no es electricidad del hogar |
| 362 Otros créditos | -12.213,48 | Alcance sin identificar; no se aplica automáticamente a electricidad |
| 309 IVA 21 % | 12.442,05 | Global; no está discriminado por servicio |
| Total general | 59.476,42 | No es el objetivo de comparación del medidor |

La aritmética se verifica: 33.747,85 + 15.000 + 10.500 = 59.247,85; el 21 % de ese subtotal redondea a 12.442,05; 59.247,85 - 12.213,48 + 12.442,05 = 59.476,42. Es una coincidencia de base numérica observada en esta factura, no una demostración de cómo deben asignarse los impuestos o créditos en general. No se prorratea el IVA global ni se supone que todo el crédito sea eléctrico.

La nota del documento indica que fijo y variable incluyen F.C.T.; no se agrega nuevamente un concepto con ese nombre.

## Período y consumo

La etiqueta es 10/26, la emisión 13/10/2026 y el vencimiento 10/11/2026. La única fecha del casillero «Fecha Lectura» es 18/09/2026. No aparecen ambas fechas ni horas que delimiten los estados 819 → 1.033 kWh. Su diferencia es 214 kWh. No se afirma que el consumo corresponda al 1–31 de octubre, ni se asigna unilateralmente a la fecha visible el rol de inicio o final.

Falta el historial de lecturas del proveedor o la factura anterior con fechas completas. Por eso no se consultó ni se presentó como conciliado un intervalo inventado de la app. Los kWh y cobertura del mismo intervalo quedan pendientes; no se multiplican por días para forzar el total. El medidor propio puede tener alcance/precisión distintos; para conciliar la vivienda se requiere el central, no un medidor de área.

## Contraste público y diferencias

SPSE publica vigencia desde 1/7/2026 y una tabla residencial CON subsidio (categorías 1, 3, 4, 5). La factura dice categoría 1, residencial, consumidor final y CON SUBSIDIO ENERGÉTICO NACIONAL. Eso contradice la antigua suposición global de la app «sin subsidio»; el nivel nacional específico y la composición del crédito no se infieren.

La calculadora pública incluye energía y servicios adicionales, según localidad, y aclara que excluye IVA y otros impuestos. No debe compararse su total con el medidor doméstico sin separar servicios.

| Comparación con 214 kWh | ARS | Diferencia contra 301 |
| --- | ---: | ---: |
| Servicio de energía facturado, antes de créditos/IVA globales | 33.747,85 | — |
| Modelo de referencia con cuadro publicado CON subsidio: fijo 14.000 + 214 × 74,535 | 29.950,49 | -3.797,36 |
| Antigua referencia SIN subsidio: fijo 17.000 + 214 × 124,224 | 43.583,94 | +9.836,09 |
| Total eléctrico neto después de crédito e impuestos asignados correctamente | No determinado | No determinado |

Los modelos de referencia anteriores utilizan un cargo mensual y el método heredado «tramo seleccionado sobre todo el consumo». Son contrastes reproducibles, NO validación exacta de la liquidación: aún debe confirmarse la regla de liquidación/prorrateo y la versión efectivamente aplicada al intervalo. La tabla oficial por sí sola no explica la diferencia. No se inventa una tasa adicional para absorberla. El renglón de agua también difiere del cuadro de referencia, pero permanece fuera del cálculo eléctrico.

Se corrigió además la variante pública sin subsidio de 301–400 kWh (127,271 por kWh); el valor heredado 127,211 se conserva únicamente en el adaptador de compatibilidad marcado sin verificar, no como versión histórica confirmada.

## Implementación

- Motor único en domain/electricity-billing.ts: proveedor, jurisdicción, segmento, vigencia, versión, fuente, bloques completos/progresivos, fijo, créditos confirmados, impuestos con bases de líneas explícitas y estados parciales.
- Versiones documentadas SPSE desde julio de 2026. No hay extrapolación a otra provincia/proveedor ni a fechas anteriores no documentadas. Si un período cruza versiones se exige dividirlo con evidencia, no se aplica la última a todo el intervalo.
- Faltan reglas confirmadas para créditos/IVA/prorrateo de esta liquidación. totalElectricity permanece null; cero no reemplaza un dato faltante.
- Se quitaron tasas y fórmulas del frontend: solo conserva tipos de API. Consumo, Proyección y equivalencias de objetivos usan el motor backend y el perfil seleccionado. Las metas guardadas conservan su valor original y la versión de referencia; cambiar la versión no reescribe ese importe.
- Sin perfil documentado se preservan los kWh y se ocultan equivalencias monetarias no justificadas. No se convierte automáticamente a todos los usuarios en subsidiados ni se usa la antigua categoría por defecto como confirmada.
- UI: desglose de cargos fijos/variables, créditos, tributos y total final pendiente; perfil SPSE según factura y comparación por fechas/horas reales. El gráfico monetario y los objetivos aclaran el alcance antes de ajustes pendientes. Agua/energía pública no entran en metas ni proyecciones.
- API /api/meter/tariff y /api/meter/bill-comparison: sesión y acceso al medidor primero; campos de identidad/tasas arbitrarias rechazados. Perfil por usuario+medidor; sin SQL/modelo de lenguaje. La comparación no se permite en un medidor de área.
- La comparación publica diferencia de kWh, fechas observadas, densidad temporal/cobertura de muestreo, huecos, reinicios y truncamiento. Un contador continuo puede conservar energía entre extremos sin ubicarla dentro de un hueco; se informa esa limitación.
- ML no cambia: no calcula tarifas ni atribuye créditos/impuestos. Solo mantiene su analítica energética.

## Migración y configuración

0021_tariff_profiles.sql crea user_meter_tariff_profiles con RLS, sin políticas de escritura directa del navegador. Solo backend autenticado accede con filtros por usuario y medidor. No se aplicó en Supabase desde esta tarea. Antes de activarlo, revisar/aplicar esa migración y elegir el segmento en Consumo → Tarifa y comparación con tu factura. Sin tabla, los kWh siguen disponibles; guardar perfil indica la migración pendiente. No hay variables nuevas.

El motor admite otros proveedores mediante definiciones versionadas revisadas; todavía no hay tarifas cargadas para ellos. Los servicios adicionales no se incluyen como líneas eléctricas; no se implementó cálculo de agua/energía pública porque esta tarea no cuenta con reglas verificadas suficientes para esos servicios.

## Verificación y pendientes

Pruebas reproducen los importes del documento y los dos contrastes sin forzar coincidencia, bases tributarias sintéticas explícitas, huecos/reinicios, áreas, versiones históricas, presupuesto original, autorización y formulario real en DOM. No se valida IVA eléctrico neto ni ahorro de factura total porque no hay evidencia para hacerlo.

Para completar la conciliación: ambas fechas/horas de lectura, desglose fijo/variable del renglón 301 o regla oficial de liquidación, cuadro efectivamente aplicado al período, identificación del crédito 362 y distribución/bases del IVA 309. No se realizó commit, push ni despliegue.

## Resultados ejecutados

- Backend: 300 pruebas aprobadas, ninguna omitida; incluye servicio Python independiente autenticado.
- Frontend: 90 verificaciones aprobadas, incluido formulario de tarifa/conciliación renderizado en DOM.
- ESLint de ambos proyectos: aprobado. TypeScript: aprobado antes de compilación final.
- No se consultaron lecturas reales para conciliar la factura: no se conocen los dos extremos del período. Las pruebas de importes usan datos del documento, no una conexión autenticada a ese intervalo real.

Compilaciones Next.js optimizadas (webpack) del frontend y backend: aprobadas, incluido chequeo TypeScript.
