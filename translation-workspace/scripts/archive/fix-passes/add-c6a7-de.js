// Add c6a7:de (ROG Zephyrus G16) German translation to the laptop hand file.
const fs = require("fs");
const path = require("path");
const p = path.join(
  __dirname,
  "..",
  "data",
  "translations",
  "translations-nov06c-laptop-hand.json",
);
const hand = JSON.parse(fs.readFileSync(p, "utf8"));
hand["6ad0cde40069aece85a8c6a7"] = hand["6ad0cde40069aece85a8c6a7"] || {};
hand["6ad0cde40069aece85a8c6a7"].de = {
  name: 'Gaming-Laptop ASUS ROG Zephyrus G16 GU606AM-TB032W (Ultra 9-386H/ RTX 5060 8GB/ 32GB/ 1TB/ 16" 2.5K OLED/ Win 11)',
  description:
    'Entdecken Sie den Gaming-Laptop ASUS ROG Zephyrus G16 GU606AM-TB032W (Ultra 9-386H/ RTX 5060 8GB/ 32GB/ 1TB/ 16" 2.5K OLED/ Win 11)\n\nDer Gaming-Laptop ASUS ROG Zephyrus G16 GU606AM-TB032W (Ultra 9-386H/ RTX 5060 8GB/ 32GB/ 1TB/ 16" 2.5K OLED/ Win 11) setzt auf die Balance zwischen Gaming-Leistung und Anzeigequalität. Der Intel Core Ultra 9 386H, die RTX 5060 8GB GDDR7 und 32GB LPDDR5X bilden eine starke Verarbeitungsgrundlage.\n\nIntel Core Ultra 9 386H meistert Multitasking gut\n\nDer Intel Core Ultra 9 386H verfügt über 16 Kerne, 16 Threads, 18MB Cache und eine maximale Frequenz von 4.9GHz. Diese Konfiguration bildet eine Grundlage für viele gleichzeitige Anforderungen — vom Spielen über die Arbeit mit mehreren Anwendungen bis zur Videobearbeitung und kreativen Aufgaben.\n\nNeben der CPU integriert die Maschine eine Intel NPU mit einer KI-Leistung von bis zu 50 TOPS. Die NPU übernimmt kompatible KI-Aufgaben gezielt, und die Copilot-Taste gibt schnellen Zugriff auf die KI-Funktionen von Windows 11 bei Bedarf.\n\nRTX 5060 8GB GDDR7 bringt eine solide Grafikgrundlage\n\nDer ASUS ROG Zephyrus G16 GU606AM-TB032W nutzt die NVIDIA GeForce RTX 5060 Laptop GPU mit 8GB GDDR7. Dieser VRAM schafft eine Grundlage für modernes Gaming und Grafikanwendungen, während die RTX-Architektur Bildtechnologien wie Ray Tracing und DLSS unterstützt .\n\n2.5K-OLED-Display mit 240Hz: Vorteil für Gaming und Kreation\n\nDas 16-Zoll-OLED-Display bietet eine Auflösung von 2560 x 1600 und eine Aktualisierungsrate von 240Hz. Die 2.5K-Auflösung schafft einen großen, scharfen Darstellungsbereich, die hohe Rate passt zu Spielen mit schnellen Bewegungen.\n\nDie Bildparameter bleiben ein Highlight: maximale Helligkeit von 1100 nits, ein Kontrastverhältnis von 1.000.000:1 und eine DCI-P3-Farbraumabdeckung von 100%. Das Display ist zudem Pantone Validated zertifiziert, unterstützt Dolby Vision HDR und NVIDIA G-SYNC — eine Anzeigekonfiguration für Unterhaltung wie bildbezogene Arbeit.\n\n32GB RAM und 1TB SSD für langfristige Nutzung\n\nDer Gaming-Laptop von ASUS ist mit 32GB LPDDR5X bei 8533MHz ausgestattet, onboard ohne RAM-Slot für Aufrüstung. Die 32GB bilden eine Grundlage für die gleichzeitige Nutzung vieler Anwendungen, besonders in Kombination von Core Ultra 9 CPU mit RTX 5060 im selben System.\n\nDie 1TB PCIe 4.0 NVMe M.2 SSD übernimmt den Hauptspeicherplatz für Windows, Software und Daten. Die Maschine hat 2 M.2-Slots für SATA oder NVMe mit einer Gesamterweiterung bis 2TB — Nutzer behalten also die Option, den Speicher zu vergrößern, wenn die Spielsammlung oder die Daten wachsen.\n\n90Wh-Akku und passende Konnektivität für einen High-Performance-Laptop\n\nDer Zephyrus G16 GU606AM-TB032W besitzt einen 90Wh-Akku mit Ladung von 0 auf 50% in 30 Minuten. Diese Kapazität passt zur mobilen Ausrichtung der Zephyrus-Serie, auch wenn die tatsächliche Laufzeit von Aufgaben und Einstellungen abhängt.\n\nDie Konnektivität umfasst Thunderbolt 4, USB-C 3.2 Gen 2, zwei USB-A 3.2 Gen 2, einen HDMI 2.1 FRL-Anschluss, eine 3,5-mm-Klinkenbuchse und einen SD-UHS-II-Kartenleser. Thunderbolt 4 und der Schnell-Leser bieten zusätzlichen Komfort für Nutzer, die oft mit Peripherie oder Bilddaten arbeiten.\n\nKaufen Sie jetzt den Gaming-Laptop ASUS ROG Zephyrus G16 GU606AM-TB032W (Ultra 9-386H/ RTX 5060 8GB/ 32GB/ 1TB/ 16" 2.5K OLED/ Win 11) bei GearVN\n\nFreuen Sie sich an jedem lebendigen Detail mit dem ROG Nebula OLED 2.5K 240Hz Display mit 100% DCI-P3 und maximaler Helligkeit von 1100 nits, verpackt in einem eleganten CNC-Aluminiumgehäuse, so dünn und leicht wie ein Ultrabook — auf dem ASUS ROG Zephyrus G16 GU606AM-TB032W. Erhöhen Sie Ihre persönliche Position und Ihr Unterhaltungserlebnis auf den Gipfel, indem Sie diesen luxuriösen Gaming-Laptop 100% offiziell jetzt bei GearVN bestellen und schon heute den schnellen Lieferdienst landesweit genießen!',
  brand: "ASUS",
  specs: {},
  technicalDescription: "Technische Daten: {}",
  imageAlts: [
    "Gaming-Laptop ASUS ROG Zephyrus G16 GU606AM-TB032W mit RTX 5060 8GB GDDR7",
    "Gaming-Laptop ASUS ROG Zephyrus G16 GU606AM-TB032W mit 32GB RAM und 1TB SSD",
  ],
};
fs.writeFileSync(p, JSON.stringify(hand, null, 2) + "\n", "utf8");
console.log("c6a7 de added; validating...");
JSON.parse(fs.readFileSync(p, "utf8"));
console.log("valid JSON");
