# Identificación de categoría con Lumi

## Causa y experiencia

El selector inicial solo mostraba categorías residenciales, sin explicar cómo identificarlas, y no distinguía desconocer el dato de conocer un código ausente. La configuración anterior podía conservarse incompleta, pero faltaban guía, contexto y confirmación.

Ajustes incorpora «No sé mi categoría», «Ayudame a identificarla», «Identificar con Lumi» y «Completar después». Abrir la ayuda conserva el formulario montado con su borrador. Lumi recibe únicamente provincia/localidad/proveedor del borrador y explica que todavía pueden no estar guardados. El cuadro de ayuda permite escribir el texto del campo, pedir instrucciones, indicar que no se tiene una factura o preguntar por una recomendación.

Se muestra el texto ingresado y la categoría del catálogo. Solo «Aplicar al suministro» modifica el formulario; no escribe en la base. Después se muestran los campos concretos que faltan y los cambios pendientes. «Guardar suministro» utiliza el flujo existente y refresca los consumidores de configuración. Una categoría conocida sin cálculo disponible puede guardarse, sin activar pesos ni mostrar $0.

## Catálogo verificado

Fuente primaria: https://spse.ar/atencion-cliente#calcularConsumo. Cuadro publicado con vigencia desde 01/07/2026, consultado el 11/11/2026 (hora de Argentina).

| Grupo oficial | Códigos oficiales | Estado del cálculo cargado |
|---|---|---|
| Residencial | 1, 3, 4, 5 | Cargos eléctricos de referencia; ajustes e impuestos pendientes según revisión anterior |
| Comercial | 11, 22, 91 | Código reconocido; no se agregó una regla de liquidación verificada |
| General | 31, 41, 51 | Código reconocido; no se agregó una regla de liquidación verificada |

No se inventaron subcategorías ni se incorporaron tasas o precios nuevos. Los códigos se mantienen separados del subsidio. «N2», «Nivel 2», «con subsidio» y «tarifa social» no se convierten en códigos de categoría. «Residencial» es ambiguo porque agrupa varios códigos; se pide el código exacto. La provincia, localidad y consumo no seleccionan una categoría. El contexto de otro proveedor no usa equivalencias de SPSE. Los períodos anteriores al cuadro y las transiciones tarifarias siguen sometidos a la resolución histórica existente; esta ayuda no prueba qué condiciones regían en una factura anterior.

El reconocimiento es acotado y conservador: código exacto, o código acompañado por un campo tarifario/grupo coherente. Se rechazan múltiples códigos, contradicciones, números de consumo sin un campo reconocible y códigos no documentados. No normaliza «T1» o «01» a «1» sin una equivalencia oficial. La propuesta es una correspondencia del texto que el usuario declara, no una verificación automática de su contrato.

## Separación de responsabilidades

- Frontend: borrador, controles, apertura del widget, revisión y confirmación. La solicitud y la aplicación se vinculan por identificador efímero, selección de medidor y contexto de suministro. Un resultado viejo no se aplica si cambió el contexto o el medidor. Cerrar la ayuda conserva el borrador. No usa localStorage para estos datos.
- Backend: catálogo oficial, reconocimiento y validación de códigos, autorización por sesión y medidor, y persistencia mediante la ruta de suministro existente. POST /api/meter/tariff-assistance es de solo lectura, con origen validado, cuerpo acotado, campos permitidos y cache privado/no-store. El contexto de borrador nunca decide identidad ni permisos. No hace consultas a datos de otras cuentas ni acepta user_id/meter_id del cuerpo.
- Machine learning: conserva su analítica y memoria. El reconocimiento del código oficial es una herramienta determinista del backend, no una predicción ni un cálculo del LLM. El chat general también explica que no corresponde recomendar una categoría arbitraria ni confundir configuración actual con el trámite de cambiarla.

## Persistencia y privacidad

category='unknown' significa que el usuario no conoce el dato; category='other' significa que el campo conocido no figura en el catálogo. category_text conserva como máximo 120 caracteres del campo de una categoría no catalogada y únicamente al guardar el suministro. No se guardan automáticamente el texto de consulta ni documentos dentro de la conversación ordinaria. La clave sigue siendo user_id/device_id, con RLS y autorización previa del backend.

No se implementó OCR, carga de PDFs, imágenes ni documentos. La ayuda admite ingreso manual y lo informa explícitamente; pide copiar solo el campo tarifario y omitir datos personales. No se envía ese campo a un proveedor de lenguaje externo. No hay facturas de otros usuarios reutilizadas ni documentos completos retenidos.

## Activación

Aplicar 0023_category_assistance.sql después de 0021_tariff_profiles.sql y 0022_supply_configuration.sql si estas todavía faltan. La nueva migración solo agrega category_text y su límite de longitud; no asigna categorías ni cambia nombres. No se aplicaron migraciones remotas desde esta tarea. El guardado informa si falta el esquema y conserva los campos.

No hay variables nuevas. Para producción se requieren las versiones actualizadas del frontend, backend y Python. No se realizaron commits, push ni despliegues.

También se completó la opción «Respuestas breves y concretas» en Preferencias de Lumi. Se persiste por usuario/medidor en el almacenamiento existente, no necesita migración adicional, y admite «más detalle» sin perder el tema. No se recortan mecánicamente las lecturas, unidades, fechas ni advertencias.

## Verificación

Pruebas cubren usuario sin factura, ingreso reconocido/desconocido/ambiguo, subsidio versus categoría, categoría oficial sin cálculo disponible, confirmación explícita, guardado incompleto y reanudación, conservación del borrador, error de consulta, contexto modificado, cambio de medidor, actualización por el guardado existente y protección de identidades. Incluyen el widget Lumi real renderizado en DOM con Ajustes y la herramienta de reconocimiento real; no solo un controlador de prueba.

El entorno de pruebas usa datos sintéticos y almacenamiento aislado. La comprobación en un navegador autenticado real no se realizó; no se afirma que una migración pendiente ya esté aplicada ni que la factura haya sido leída automáticamente.

Resultados ejecutados: 311 pruebas de backend, 62 pruebas de Python y 100 verificaciones frontend/DOM aprobadas. Se incluyen conservación de unidades/advertencias con respuestas breves y persistencia por usuario/medidor. ESLint y chequeos de tipos aprobados; las compilaciones optimizadas se comprobaron durante la entrega. La comprobación en cuenta real y la aplicación remota de migraciones quedan pendientes.
