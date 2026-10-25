# Pangolin

Diese Integration verbindet Gladys mit [Pangolin](https://pangolin.net), dem
Tunnel-Reverse-Proxy, der deine Dienste im Internet erreichbar macht, ohne einen
Port am Router zu öffnen. Sie funktioniert mit einem **selbst gehosteten**
Pangolin ebenso wie mit **Pangolin Cloud**.

Was du in Gladys bekommst:

- ein Gerät pro **Standort** (ein Newt-Tunnel, ein WireGuard-Standort, der
  Pangolin-Host selbst), mit seinem **Online**-Zustand und seinem
  Datenverkehr (**eingehende Daten**, **ausgehende Daten**);
- ein Gerät pro **öffentlicher Ressource** (eine HTTPS-Seite auf deiner
  Domain, ein roher TCP/UDP-Port), mit einem **Aktiviert**-Schalter, den du
  aus Gladys ausschalten kannst, und ihrem **Zustand**;
- Szenen-Auslöser, Szenen-Aktionen und ein Dashboard-Widget (Gladys 5.1 oder
  neuer).

Erfordert **Gladys 5.3.0** oder neuer.

## Bevor du beginnst

### 1. Die Integrations-API aktivieren (nur selbst gehostet)

Pangolin Cloud hat sie bereits. Bei einem selbst gehosteten Pangolin
(Community Edition) ist die Integrations-API standardmäßig aus: Füge dies in
`config/config.yml` ein und starte Pangolin neu.

```yaml
flags:
  enable_integration_api: true
```

Die API lauscht dann im Pangolin-Container auf Port **3003** (oder **3004**,
je nach Version: Sieh in deiner Konfiguration unter
`server.integration_port` nach). In der
[Pangolin-Dokumentation](https://docs.pangolin.net/manage/integration-api)
steht, wie du sie auf einer Domain wie `https://api.example.com/v1`
veröffentlichst.

### 2. Einen API-Schlüssel erstellen

Öffne in Pangolin deine Organisation, dann **API-Schlüssel →
API-Schlüssel generieren**. Gib ihm diese Berechtigungen:

| Berechtigung            | Wofür                                                      |
| ----------------------- | ---------------------------------------------------------- |
| Standorte auflisten     | die Standort-Geräte                                        |
| Ressourcen auflisten    | die Ressourcen-Geräte                                      |
| Organisation abrufen    | den Namen, den „Verbindung testen“ anzeigt (optional)      |
| Ressource aktualisieren | eine Ressource aus Gladys ein- oder ausschalten (optional) |

Kopiere den Schlüssel sofort: Pangolin zeigt ihn nur einmal an. Er sieht so
aus: `abc123xyz.0123456789abcdef`.

Verwende einen eigenen **Organisations**-Schlüssel für Gladys, nie einen
Root-Schlüssel.

### 3. Die Organisations-ID finden

Sie steht in der Adressleiste, wenn du deine Organisation in Pangolin
aufrufst: `https://pangolin.example.com/meine-org/settings` → `meine-org`.

## Konfiguration

| Feld                             | Was eintragen                                                                                                                           |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Lokale API-Adresse**           | Nur selbst gehostet: die Integrations-API in deinem Netzwerk, z. B. `http://192.168.1.10:3004/v1`. Sonst leer lassen.                   |
| **Internet-API-Adresse**         | Pangolin Cloud: `https://api.pangolin.net/v1`. Selbst gehostet: ihre öffentliche Adresse, z. B. `https://api.example.com/v1`.           |
| **API-Schlüssel**                | Der oben erstellte Schlüssel.                                                                                                           |
| **Organisations-ID**             | Die oben gefundene ID.                                                                                                                  |
| **Aktualisierungsintervall (s)** | Wie oft Pangolin gelesen wird (30 bis 3600 s, standardmäßig 60). Jede Abfrage sind zwei Anfragen, unabhängig von der Anzahl der Geräte. |

Trage mindestens eine der beiden Adressen ein. `/v1` wird ergänzt, falls du
es vergisst.

Drücke dann **Verbindung testen**: Es probiert jede eingetragene Adresse und
sagt für jede, was Pangolin geantwortet hat — die Organisation, die Anzahl der
Standorte und Ressourcen oder den Grund des Fehlers.

### Lokal oder Internet: der Schalter „Lokale Verbindung bevorzugen“

Sind beide Adressen eingetragen, ruft Gladys die auf, auf die der Schalter
**Lokale Verbindung bevorzugen** zeigt, und weicht nur dann auf die andere
aus, wenn die erste **nicht antwortet** (Netzwerk weg, Zeitüberschreitung,
ein Proxy, der 502, 503 oder 504 antwortet). Ein falscher Schlüssel oder eine
unbekannte Organisation lösen keinen Wechsel aus: Beide Adressen führen zum
selben Server, und die Antwort wäre dieselbe.

Jedes Gerät zeigt die verwendete Adresse auf seinem Badge: **lokal**,
**Cloud** oder **nicht erreichbar**. Ein oranger Punkt heißt, dass Gladys die
Ausweichadresse nutzt: Es funktioniert, aber nicht so, wie du es wolltest —
prüfe die bevorzugte Adresse.

Mit nur einer Adresse gibt es keine Ausweichadresse: Das Badge zeigt diese
Adresse oder „nicht erreichbar“.

## Geräte

Öffne den Tab **Entdecken** der Integration: Jeder Standort und jede
öffentliche Ressource der Organisation ist dort aufgelistet. Lege in Gladys
die an, die du möchtest.

### Standort

| Funktion | Werte                                 | Hinweise                                                           |
| -------- | ------------------------------------- | ------------------------------------------------------------------ |
| Online   | 1 = Tunnel aktiv, 0 = Tunnel getrennt | Fehlt bei einem „lokalen“ Standort: Pangolin meldet keinen Zustand |
| Data in  | Megabyte                              | Zähler von Pangolin, bis du ihn dort zurücksetzt                   |
| Data out | Megabyte                              | Ebenso                                                             |

### Öffentliche Ressource

| Funktion | Werte                               | Hinweise                                                                                              |
| -------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Enabled  | 1 = bereitgestellt, 0 = deaktiviert | **Steuerbar**: Ausschalten lässt Pangolin die Ressource nicht mehr bereitstellen, ohne sie zu löschen |
| Healthy  | 1 = fehlerfrei, 0 = gestört         | Ergebnis der Zustandsprüfungen ihrer Ziele. Leer, wenn die Ressource keine Zustandsprüfung hat        |

Private Ressourcen (die über einen Pangolin-Client erreicht werden) werden
nicht abgedeckt.

Die Geräte behalten ihre Identität, wenn du einen Standort oder eine Ressource
in Pangolin umbenennst: Sie hängen an den internen Nummern von Pangolin, nicht
an Namen oder Domains. Ein in Pangolin gelöschter Standort oder eine gelöschte
Ressource erscheint **nicht erreichbar**: Du kannst das Gerät in Gladys
löschen.

## Szenen und Dashboard (Gladys 5.1)

### Auslöser

| Auslöser                                             | Filter                                     | Variablen                                               |
| ---------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------- |
| **Ein Pangolin-Standort geht online oder offline**   | Standort, neuer Status (online / offline)  | `site_name`, `status`                                   |
| **Der Zustand einer Pangolin-Ressource ändert sich** | Ressource, neuer Zustand                   | `resource_name`, `address`, `health`, `previous_health` |
| **Pangolin antwortet nicht mehr oder wieder**        | neuer Status (antwortet / antwortet nicht) | `status`, `reason`, `organization`                      |

Sie lösen **einmal pro Änderung** aus, bei der Abfrage, die sie bemerkt —
also innerhalb des Aktualisierungsintervalls. Beim Start oder nach einer
Konfigurationsänderung löst nichts aus: „Der Standort ist offline“ ist in
diesem Moment ein Zustand, kein Ereignis. Die Auslöser funktionieren auch für
Standorte und Ressourcen, die du nicht als Geräte angelegt hast.

Verwende die Variablen in einer Szene wie alle anderen, z. B.
`{{triggerEvent.data.site_name}} ist {{triggerEvent.data.status}}`.

### Aktionen

| Aktion                                              | Felder               | Ausgaben                                                                                  |
| --------------------------------------------------- | -------------------- | ----------------------------------------------------------------------------------------- |
| **Pangolin-Ressource aktivieren oder deaktivieren** | Ressource, aktiviert | `enabled`                                                                                 |
| **Pangolin jetzt aktualisieren**                    | —                    | `connected`, `sites_online`, `sites_offline`, `resources_unhealthy`, `resources_disabled` |

Beispiel: Wenn alle das Haus verlassen, die Ressource „Kameras“ aktivieren;
wenn die erste Person zurückkommt, sie deaktivieren.

### Widget „Pangolin-Übersicht“

Füge es im Dashboard-Editor hinzu. Es zeigt:

- drei Kacheln: Standorte online, aktive Ressourcen, gestörte Ressourcen;
- die Verbindung (lokal, Internet, orange auf der Ausweichadresse, rot, wenn
  Pangolin nicht antwortet);
- die Probleme, die schwersten zuerst: Offline-Standorte, gestörte
  Ressourcen, deaktivierte Ressourcen — so viele, wie die Einstellung
  **Aufgelistete Probleme** angibt (0 bis 9);
- eine Schaltfläche **Aktualisieren**.

## Fehlerbehebung

| Meldung                                                   | Was tun                                                                                                                                                       |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| _Pangolin antwortet nicht (…)_                            | Prüfe Adresse und Port und ob die Integrations-API aktiviert ist. Der Grund (ECONNREFUSED, Zeitüberschreitung…) hilft.                                        |
| _Pangolin hat den API-Schlüssel abgelehnt_                | Der Schlüssel ist falsch oder wurde gelöscht: Erstelle einen neuen.                                                                                           |
| _Der API-Schlüssel darf die Organisation „…“ nicht lesen_ | Der Schlüssel gehört zu einer anderen Organisation oder ihm fehlt eine Berechtigung: siehe [Einen API-Schlüssel erstellen](#2-einen-api-schlüssel-erstellen). |
| _Pangolin kennt keine Organisation „…“_                   | Prüfe die Organisations-ID und ob die Adresse die der API ist (endet auf `/v1`), nicht die des Dashboards.                                                    |
| Eine Ressource lässt sich nicht ausschalten               | Dem Schlüssel fehlt **Ressource aktualisieren**.                                                                                                              |

Die Protokolle der Integration nennen jede fehlgeschlagene Abfrage und jeden
Wechsel auf die Ausweichadresse. Der API-Schlüssel erscheint nie darin.

## Sicherheit

- Der API-Schlüssel wird in einem geheimen Feld gespeichert, nur an die von
  dir konfigurierten Adressen gesendet und nie protokolliert.
- Wer in Gladys einen Schalter betätigen oder eine Szene starten kann, kann
  deine öffentlichen Ressourcen öffnen oder schließen: Denk daran, wenn du
  Gladys teilst.
- Verwende für die Internetadresse `https://`.
