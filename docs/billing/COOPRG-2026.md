# Cooperativa Eléctrica de Río Grande · julio a octubre de 2026

El catálogo sugiere la Cooperativa en Río Grande, Tierra del Fuego. El [plan municipal](https://www.riogrande.gob.ar/wp-content/uploads/2022/11/PLAN-ESTRATEGICO-RIO-GRANDE-SOSTENIBLE-2022.pdf) y el [sitio de la Cooperativa](https://www.cooprg.org.ar/) documentan el servicio en la ciudad. La factura confirma la distribuidora del suministro. No se verificó un padrón de domicilios ni el perímetro de la concesión.

| Cuadro | Vigencia incluida | Categorías con cálculo |
|---|---|---|
| [Julio](https://www.cooprg.org.ar/resoluciones/2026-07%20Julio/Cuadro%20Tarifario%20Reso%20SEN%20109-2026%20-%20desde%201-07-2026.pdf) | 01/07–31/07 | TR1, TR2, T1G, T2P |
| [Agosto](https://www.cooprg.org.ar/resoluciones/2026-08%20Agosto/Cuadro%20Tarifario%20Reso%20SEN%20190-2026%20-%20desde%201-08-2026.pdf) | 01/08–31/08 | TR1, TR2, T1G, T2P |
| [Septiembre](https://www.cooprg.org.ar/resoluciones/2026-09%20Septiembre/Cuadro%20Tarifario%20Res%20SEN%20190-2026%20-%20desde%2001-Sep-2026.pdf) | 01/09–30/09 | TR1, TR2, T1G, T1E, T2P |
| [Octubre](https://www.cooprg.org.ar/resoluciones/2026-10%20Octubre/Cuadro%20Tarifario%20Reso%20SEN%20190-2026%20-%20desde%201-10-2026.pdf) | 01/10–31/10 | TR1, TR2, T1G, T1E, T2P |

TR1 y TR2 corresponden a T 1-R1 y T 1-R2. Los límites de TR2 son 150 y 300 kWh en julio y agosto, y 200 y 300 kWh en septiembre y octubre. En T2P, el simulador admite kW contratados. TM1 queda como código declarable según el pedido, sin una equivalencia confirmada con las variantes de tensión y demanda que permitiría calcular su factura.

El [simulador de la Cooperativa](https://www.cooprg.org.ar/simuladoryleerfactura/simulador-tarifas.html) incluye capitalización. Para TR1 a 350 kWh, los importes de septiembre y octubre coinciden con $72.226,59 y $72.871,50. Para julio y agosto, el gráfico del simulador muestra $75.581 y $71.230 redondeados. La cuota de $25/kWh de agosto se deduce del gráfico contrastado con fijo y energía del cuadro. En consultas inferiores al ciclo, EnergIA Sur muestra una referencia con límites y cargo fijo proporcionales a 30 días. Una observación corta no permite establecer por sí sola qué escalón del ciclo facturado corresponde.

## Factura histórica

Se usaron los datos tarifarios transcritos, sin identificadores. Aunque las fechas de lectura son del 02/06 al 02/07, los precios y el fijo corresponden al cuadro que la factura identifica como julio. El test selecciona explícitamente ese cuadro y no transforma la fecha de emisión en vigencia de consumo. Para 279 kWh, la energía suma $45.509,40 y el subtotal con cargo fijo $53.947,17. El cargo luz de obra de ese caso es el 30 % de dicho subtotal. Con capitalización, Bomberos, alumbrado y fondo compensador del caso, el total da $83.419,25. Para febrero a julio, el promedio de los seis totales mensuales transcritos es 287,2 kWh.

La [guía de la Cooperativa](https://www.cooprg.org.ar/simuladoryleerfactura/como-leer-tu-factura.html) documenta el criterio de luz de obra, el cargo de Bomberos por kWh y el fondo para consumos bajos. Faltan fuentes que definan las alícuotas, bases y vigencias aplicables a cada suministro para automatizar esos cargos, alumbrado, tasa de sepelio o penalizaciones. El simulador admite un importe de luz de obra declarado para el escenario. Las estimaciones automáticas muestran los cargos verificados como parciales.

## Actualización y almacenamiento

Comparar el [índice oficial](https://www.cooprg.org.ar/clientes/cuadro-tarifario-y-resoluciones/) con las vigencias de `src/domain/rio-grande.ts`. Agregar cada nueva versión en una revisión de código, adjuntar su fuente y fecha de verificación, comprobar categorías y escalones contra el PDF, y comprobar escenarios con el simulador antes de publicar la revisión. Conservar las entradas anteriores. Al 18/11/2026, el índice consultado llega hasta octubre. Para noviembre, EnergIA Sur ofrece el historial y deja el cálculo actual pendiente de un cuadro publicado.

La migración `0025_cooprg_supply.sql` amplía el proveedor y agrega tipo de suministro y declaración de luz de obra a `user_meter_tariff_profiles`. La API sigue validando el medidor autorizado y consultando por usuario y medidor. Los cuadros públicos tienen historial en código y la factura de prueba queda en los tests.
