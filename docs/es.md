# Pangolin

Esta integración conecta Gladys con [Pangolin](https://pangolin.net), el proxy
inverso con túneles que expone sus servicios en Internet sin abrir ningún
puerto en su router. Funciona con un Pangolin **autoalojado** y con
**Pangolin Cloud**.

Lo que obtiene en Gladys:

- un dispositivo por **sitio** (un túnel Newt, un sitio WireGuard, el propio
  host de Pangolin), con su estado **en línea** y su tráfico (**datos
  entrantes**, **datos salientes**);
- un dispositivo por **recurso público** (un sitio HTTPS en su dominio, un
  puerto TCP/UDP), con un interruptor **activado** que puede apagar desde
  Gladys y su **estado de salud**;
- disparadores y acciones de escena, y un widget del panel (Gladys 5.1 o
  posterior).

Requiere **Gladys 5.3.0** o posterior.

## Antes de empezar

### 1. Activar la API de integración (solo autoalojado)

Pangolin Cloud ya la tiene. En un Pangolin autoalojado (Community Edition) la
API de integración está desactivada por defecto: añada esto a
`config/config.yml` y reinicie Pangolin.

```yaml
flags:
  enable_integration_api: true
```

La API escucha entonces dentro del contenedor de Pangolin en el puerto
**3003** (o **3004**, según la versión: mire `server.integration_port` en su
configuración). Consulte la
[documentación de Pangolin](https://docs.pangolin.net/manage/integration-api)
para publicarla en un dominio como `https://api.example.com/v1`.

### 2. Crear una clave de API

En Pangolin, abra su organización y luego **Claves API → Generar clave API**.
Dele estos permisos:

| Permiso              | Para qué                                              |
| -------------------- | ----------------------------------------------------- |
| Listar sitios        | los dispositivos de sitio                             |
| Listar recursos      | los dispositivos de recurso                           |
| Obtener organización | el nombre que muestra «Probar la conexión» (opcional) |
| Actualizar Recurso   | activar o apagar un recurso desde Gladys (opcional)   |

Copie la clave enseguida: Pangolin solo la muestra una vez. Tiene este
aspecto: `abc123xyz.0123456789abcdef`.

Use una clave **de organización** dedicada a Gladys, nunca una clave root.

### 3. Encontrar el ID de la organización

Está en la barra de direcciones cuando navega por su organización en
Pangolin: `https://pangolin.example.com/mi-org/settings` → `mi-org`.

## Configuración

| Campo                               | Qué poner                                                                                                                                 |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **Dirección local de la API**       | Solo autoalojado: la API de integración en su red, p. ej. `http://192.168.1.10:3004/v1`. Si no, déjelo vacío.                             |
| **Dirección de Internet de la API** | Pangolin Cloud: `https://api.pangolin.net/v1`. Autoalojado: su dirección pública, p. ej. `https://api.example.com/v1`.                    |
| **Clave de API**                    | La clave creada arriba.                                                                                                                   |
| **ID de la organización**           | El ID encontrado arriba.                                                                                                                  |
| **Intervalo de actualización (s)**  | Frecuencia de lectura de Pangolin (30 a 3600 s, 60 por defecto). Cada lectura son dos peticiones, sea cual sea el número de dispositivos. |

Indique al menos una de las dos direcciones. Si olvida `/v1`, se añade.

Pulse luego **Probar la conexión**: prueba cada dirección indicada y dice,
para cada una, lo que respondió Pangolin — la organización, el número de
sitios y recursos, o el motivo del fallo.

### Local o Internet: el interruptor «Preferir la conexión local»

Con las dos direcciones, Gladys llama a la que indica el interruptor
**Preferir la conexión local**, y solo recurre a la otra cuando la primera
**no responde** (red caída, tiempo de espera agotado, un proxy que responde
502, 503 o 504). Una clave incorrecta o una organización desconocida no
provocan el cambio: las dos direcciones llevan al mismo servidor y la
respuesta sería la misma.

Cada dispositivo muestra la dirección en uso en su insignia: **local**,
**cloud** o **inaccesible**. Un punto naranja significa que Gladys usa la
dirección de respaldo: funciona, pero no como lo pidió — revise la dirección
preferida.

Con una sola dirección no hay respaldo: la insignia muestra esa dirección, o
inaccesible.

## Dispositivos

Abra la pestaña **Descubrir** de la integración: aparece cada sitio y cada
recurso público de la organización. Cree en Gladys los que quiera.

### Sitio

| Función  | Valores                           | Notas                                                       |
| -------- | --------------------------------- | ----------------------------------------------------------- |
| Online   | 1 = túnel activo, 0 = túnel caído | Ausente en un sitio «local»: Pangolin no da ningún estado   |
| Data in  | megabytes                         | Contador que lleva Pangolin, hasta que lo ponga a cero allí |
| Data out | megabytes                         | Igual                                                       |

### Recurso público

| Función | Valores                            | Notas                                                                                                |
| ------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Enabled | 1 = servido, 0 = desactivado       | **Controlable**: apagarlo hace que Pangolin deje de servir el recurso, sin borrarlo                  |
| Healthy | 1 = en buen estado, 0 = con fallos | Resultado de las comprobaciones de estado de sus destinos. Vacío si el recurso no tiene comprobación |

Los recursos privados (los que se alcanzan con un cliente de Pangolin) no
están cubiertos.

Los dispositivos conservan su identidad cuando renombra un sitio o un recurso
en Pangolin: están ligados a los números internos de Pangolin, no a nombres ni
dominios. Un sitio o recurso borrado en Pangolin aparece **inaccesible**:
puede borrar el dispositivo en Gladys.

## Escenas y panel (Gladys 5.1)

### Disparadores

| Disparador                                        | Filtros                                       | Variables                                               |
| ------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------- |
| **Un sitio Pangolin se conecta o desconecta**     | sitio, nuevo estado (en línea / sin conexión) | `site_name`, `status`                                   |
| **Cambia el estado de un recurso de Pangolin**    | recurso, nuevo estado                         | `resource_name`, `address`, `health`, `previous_health` |
| **Pangolin deja de responder o vuelve a hacerlo** | nuevo estado (responde / no responde)         | `status`, `reason`, `organization`                      |

Se disparan **una vez por cambio**, en la lectura que lo detecta — es decir,
dentro del intervalo de actualización. Nada se dispara al arrancar ni tras un
cambio de configuración: «el sitio está sin conexión» en ese momento es un
estado, no un evento. Los disparadores funcionan incluso para los sitios y
recursos que no ha creado como dispositivos.

En una escena, use las variables como cualquier otra, p. ej.
`{{triggerEvent.data.site_name}} está {{triggerEvent.data.status}}`.

### Acciones

| Acción                                          | Campos            | Salidas                                                                                   |
| ----------------------------------------------- | ----------------- | ----------------------------------------------------------------------------------------- |
| **Activar o desactivar un recurso de Pangolin** | recurso, activado | `enabled`                                                                                 |
| **Actualizar Pangolin ahora**                   | —                 | `connected`, `sites_online`, `sites_offline`, `resources_unhealthy`, `resources_disabled` |

Ejemplo: cuando todos salen de casa, activar el recurso «Cámaras»; cuando
vuelve la primera persona, desactivarlo.

### Widget «Resumen de Pangolin»

Añádalo desde el editor del panel. Muestra:

- tres casillas: sitios en línea, recursos activos, recursos con fallos;
- la conexión (local, Internet, naranja en la dirección de respaldo, rojo
  cuando Pangolin no responde);
- los problemas, los más graves primero: sitios sin conexión, recursos con
  fallos, recursos desactivados — tantos como indique el ajuste **Problemas
  listados** (0 a 9);
- un botón **Actualizar**.

## Solución de problemas

| Mensaje                                             | Qué hacer                                                                                                                       |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| _Pangolin no responde (…)_                          | Compruebe la dirección y el puerto, y que la API de integración esté activada. El motivo (ECONNREFUSED, tiempo agotado…) ayuda. |
| _Pangolin rechazó la clave de API_                  | La clave es incorrecta o se borró: cree una nueva.                                                                              |
| _La clave de API no puede leer la organización «…»_ | La clave pertenece a otra organización o le falta un permiso: vea [Crear una clave de API](#2-crear-una-clave-de-api).          |
| _Pangolin no conoce ninguna organización «…»_       | Compruebe el ID de la organización, y que la dirección sea la de la API (termina en `/v1`), no la del panel.                    |
| Un recurso no se apaga                              | A la clave le falta **Actualizar Recurso**.                                                                                     |

Los registros de la integración indican cada lectura fallida y cada cambio a
la dirección de respaldo. La clave de API nunca aparece en ellos.

## Seguridad

- La clave de API se guarda en un campo secreto, solo se envía a las
  direcciones que ha configurado y nunca se registra.
- Cualquiera que pueda accionar un interruptor o lanzar una escena en Gladys
  puede abrir o cerrar sus recursos públicos: téngalo en cuenta al compartir
  Gladys.
- Para la dirección de Internet, use `https://`.
