# Body Sculpt Intensive: vier Termine

Bestätigter Umfang: vier EMS-Sculpt-Termine pro Kalendermonat; an zwei frei gewählten Terminen zusätzlich Lymphdrainage. EMS allein 30 Minuten, Kombination 60 Minuten. Bestehender Apntly-Service bleibt, NO PAYMENT aktiviert. Beide Varianten und Zeiten im Apntly-Admin geprüft. Shopify-Varianten: 59265461846280 / 59265461879048.

Backend speichert die gewählte Option am Token und an der bestätigten Buchung. Slotvalidierung reserviert Kontingent unter Mitgliedssperre; eigene Reservierung wird bei Wiederholungen ausgenommen. Nicht abgeschlossene Reservierungen verfallen mit dem bestehenden 15-Minuten-Token. Bestätigung ersetzt die Reservierung atomar durch eine Buchung und wiederholt die Kontingentprüfung. Damit gibt es höchstens vier Termine und zwei Lymphdrainagen. Andere PRIVATE-Protokolle bleiben nach der Auswahl gesperrt. Stornierung gibt die gebuchten Ansprüche frei; administrative Verschiebungen in andere Monate prüfen beide Kontingente. Manuelle Buchungen erfordern die Terminvariante; Office zeigt die Variante an.

Migration 012 fügt ausschließlich nullable Spalten hinzu. Vorabprüfung: keine historischen Body-Sculpt-Buchungen; keine rückwirkende Zuordnung nötig. Die Startup-Schemapflege enthält die gleichen Ergänzungen.

Prüfung: 103 Backend-Tests bestanden, einschließlich Varianten-/Dauerprüfung, Tokenbindung, wiederholter Kontingentprüfung sowie konkurrierender Reservierungen. Office-Produktionsbuild erfolgreich (bestehende Warnung zur Bündelgröße). Shopify Theme Check: geänderte Dateien valide; zwei bestehende isModal-Namenswarnungen. Gerenderten Flyer rechts innen visuell geprüft, Faltansicht mit aktuellen Bildern aktualisiert. Keine echten Kundentermine für Tests angelegt.

Grenze: Dies prüft Logik, Konfiguration und Auslieferung. Ein echter Kalenderabschluss mit Kundentermin wurde nicht ausgeführt. Flyer ist weiterhin ein RGB-Entwurf; finale FLYERALARM-Druckaufbereitung steht aus.
