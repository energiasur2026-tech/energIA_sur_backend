# Proyección mensual — implementación y validación

## Diagnóstico
El selector cambiaba solo mode, conservando el mismo número. El objetivo original en pesos se perdía: se almacenaba goal_kwh y el modo solo afectaba su presentación. La cifra mensual provenía de energía observada en el mes / días medidos × días calendario (con un piso artificial de un día). La cifra secundaria usaba hasta 90 días de historia / duración × 30. Por eso valores como 176,4 y 77,67 no describían el mismo horizonte ni la misma muestra. No hay un modelo ML en esos cálculos.

## Fuente única activa
src/domain/monthly-projection.ts se usa tanto en /api/meter/forecast como en /api/meters. El Monitor ya consume goal y recommendations de forecast; conserva ese contrato. La tarjeta secundaria de 30 días se retiró de esta vista. Los módulos legacy forecast/goal permanecen para compatibilidad, pero no calculan el cierre principal. El frontend conserva tipos y presentación: se retiraron las funciones antiguas de goal, forecast y recommendations.

Energía observada: deltas no negativos del contador entre mediciones válidas. Retrocesos invalidan el total/proyección. Promedio diario: energía observada / duración exacta en días, mínimo un ciclo observado de 24 horas antes de extrapolar. Cierre: energía observada + estimación del inicio no medido + promedio × tiempo exacto desde última lectura hasta fin del mes. El día actual no se cuenta como completo ni se suma dos veces. Margen: máximo(0, objetivo − acumulado a fecha actual estimado) / fracción de días restantes. El exceso confirmado se informa sobre energía observada, sin margen negativo. Si no hay lecturas recientes, si el contador retrocede o si la consulta se trunca, se suprime la proyección.

Los meses empiezan a 00:00 de Argentina (UTC−3), con 28/29/30/31 días. El selector admite mes actual o anterior; aplica el objetivo mensual vigente como referencia, no reconstruye objetivos históricos. La zona horaria soportada actualmente es la configurada por esta app: America/Argentina/Buenos_Aires.

## Tarifa y objetivo
Motor existente: SPSE residencial sin subsidio; cargo fijo mensual y cargo variable sobre todo el consumo al precio del tramo correspondiente. Medidor de área excluye fijo. Para un mes calendario completo el fijo se aplica una vez (el motor usa 30 días como unidad mensual), incluso en febrero o meses de 31 días. No hay impuestos, alumbrado, agua, cloaca ni otras categorías/subsidios implementados. No existe fecha de vigencia verificable en la configuración: se informa, no se inventa. ENERGY_TARIFF_ENABLED=false permite operar en kWh sin equivalencia monetaria.

La inversión pesos→kWh busca por bisección el mayor consumo cuyo costo real del motor no supera el presupuesto, incluyendo discontinuidades de tramo. No divide por una tarifa plana. El editor conserva un ancla exacta mientras se cambia de unidad; solo formatea valores derivados, nunca reformatea durante escritura ni guarda al alternar. Guardar usa el valor sin el redondeo visual. El importe original ARS o la energía original se guarda en user_meter_goals; el cambio del cuadro recalcula la equivalencia, no el valor fijado. La versión se deriva de los valores tarifarios. Los objetivos legacy en pesos no pueden reconstruirse porque el importe original no fue persistido: se preserva su energía almacenada y se informa el origen anterior.

## Persistencia y autorización
Aplicar supabase/migrations/0019_personal_monthly_goals.sql antes de guardar objetivos nuevos. No se aplicó a producción. Las lecturas y objetivos se consultan solamente tras validar sesión y pertenencia del medidor, usando user_id + device_id en la persistencia personal. La tabla tiene RLS y no habilita escrituras directas del navegador. El dueño puede conservar su meta legacy; un miembro compartido no hereda objetivos privados ajenos. El borrado guarda un registro vacío para no resucitar el valor legacy. No se usa user_id del navegador como autorización. No se agregaron caches ni trabajos globales.

## Cobertura y recomendaciones
La cobertura mide frecuencia de muestreo dentro del intervalo observado; no es confianza predictiva. Se muestran huecos, antigüedad, días completos, truncación e inicio faltante. Un contador continuo permite energía entre extremos sin localizar consumo en huecos; el gráfico interrumpe la línea observada y nunca llena días futuros con cero. Su escala incluye objetivo y cierre aunque se oculten referencias.

La recomendación nocturna requiere al menos tres franjas de 01 a 05 h con tres muestras por franja y un perfil con al menos tres días completos. Describe la menor media nocturna, período incluido. La equivalencia 24 h es un escenario, no ahorro garantizado ni identificación de electrodomésticos. Cambiar cargas de horario no se anuncia como reducción de kWh.

## Verificación
Pruebas controladas de calendario, día parcial y último día, objetivo superado, datos incompletos, contador reiniciado, datos viejos/truncados, inversión de tarifa (incluidos saltos), medidor de área, tarifa deshabilitada, guardado ARS/kWh, borrado, dos usuarios y rechazo A→medidor B. Suite del backend, TypeScript de frontend y src/tests backend, ESLint de archivos afectados. No se mezclaron fixtures con lecturas reales.

Vista previa: frontend /projection-preview solo en desarrollo. Usa los componentes de producto y una respuesta calculada por el dominio real con fixtures. Guardado deshabilitado; no consulta ni modifica producción. Verificación visual en 1280×900 y 390×844: equivalencia a derecha/debajo respectivamente, sin desbordamiento horizontal, gráfico completo, ida/vuelta de unidad vuelve al importe original. Capturas en frontend docs/projection. Es material de verificación, no un acceso del menú del producto.

Pendiente de entorno: aplicar migración 0019 y publicar los repositorios frontend/backend; verificar luego el flujo con una sesión real. No se hicieron pushes/despliegues. La dependencia local @netlify/functions ausente impide afirmar un build completo del backend; src/tests sí se comprueban con dependencias compatibles disponibles. No se modificó machine_learning, porque esta estimación y el motor tarifario ya pertenecían al backend.

Resultado final: 243 tests de backend aprobados (incluido el servicio Python real con fixtures y tres identidades para objetivos), 14 checks del editor argentino, TypeScript frontend y src/tests backend, ESLint de archivos afectados. No se ejecutó un build completo ni un guardado con base de producción.
