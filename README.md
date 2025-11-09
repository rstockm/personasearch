# PersonaSearch

Willkommen zu PersonaSearch – einer modernen, leichtgewichtigen Web-App für präzise Buch‑ und Filmsuche mit KI‑Assistenz.

## Prolog
Bibliotheks‑ und Katalogdaten wie die von OpenLibrary sind über Jahre gereift und zeichnen sich durch ihre hohe Genauigkeit und verlässliche Kuratierung aus. Gleichzeitig verstecken sich hinter diesen Katalogen häufig mächtige, aber selten genutzte Experten‑Suchfunktionen, die vielen Nutzenden schwer zugänglich sind. PersonaSearch verbindet beides: Wir vertrauen auf die belastbare Exaktheit der Kataloge – und setzen KI nur dort ein, wo sie echten Mehrwert schafft, nämlich beim Übersetzen natürlicher Sprache in die passenden, strukturierten Suchanfragen. So bleibt die Ergebnisqualität hoch, während die Nutzung spürbar einfacher wird.

## Live‑Demo
- App: [rstockm.github.io/personasearch](https://rstockm.github.io/personasearch/)
- Dokumentation: [rstockm.github.io/personasearch/docs.html](https://rstockm.github.io/personasearch/docs.html)

## Features
- KI‑gestützte Analyse natürlichsprachiger Suchanfragen (z. B. „neueste deutsche Fantasy‑Romane“) → strukturierte Suche
- Tabs für Sucheinstiege: Titel, Autor, Genre, Erweitert, Film
- Relevanz‑ oder Datumssortierung, je nach Anfrage
- Ergebnis‑Tabellen mit Cover‑Vorschau (Bücher) bzw. Bewertung/Typ (Filme/Serien)
- Robuste Fehlerbehandlung mit Retry‑Logik

## Architektur in Kürze
- Statisches Frontend (GitHub Pages): `index.html`, `css/style.css`, `js/app.js`
- Externe Datenquellen:
  - Bücher: OpenLibrary Search API
  - Filme/Serien: TMDB Search API
  - KI‑Parsing: OpenRouter (Claude 3.5 Sonnet)
- Serverseitiger Sicherheits‑Proxy (LAMP/PHP) für API‑Secrets: `lamp/openrouter_proxy.php`
  - Route 1 (POST): Weiterleitung an OpenRouter
  - Route 2 (GET): Weiterleitung an `TMDB /search/multi`

## Verzeichnisüberblick
```text
personasearch/
├─ index.html                 # App UI
├─ docs.html                  # Projekt-Dokumentation (HTML)
├─ css/style.css
├─ js/app.js                  # App-Logik (Frontend)
└─ lamp/                      # LAMP-Proxy (nur Serverdeployment)
   ├─ openrouter_proxy.php    # PHP-Proxy für OpenRouter & TMDB
   ├─ .htaccess               # Sicherheit/CORS/Env
   └─ secret.sample.ini       # Beispiel für Secret-Datei (nicht produktiv nutzen)
```

## Wichtige technische Details
### 1) Frontend (GitHub Pages)
- Die App ist rein statisch und kann ohne Build‑Schritt auf GitHub Pages gehostet werden.
- Interne Links sind auf den Pages‑Pfad ausgerichtet:
  - Logo/Start: `https://rstockm.github.io/personasearch/`
  - Dokumentation: `https://rstockm.github.io/personasearch/docs.html`
- Der System‑Prompt für die KI befindet sich in `js/app.js` (Konstanten‑String).

### 2) Sicherheit / API‑Keys
- Im Frontend werden keine Secrets ausgeliefert.
- OpenRouter‑ und TMDB‑Zugriffe laufen über den PHP‑Proxy, der die Keys serverseitig hält.
- In `js/app.js` ist die TMDB‑Suche bereits auf den Proxy geroutet, ebenso das KI‑Parsing.

### 3) Proxy‑Konfiguration (LAMP/PHP)
Dateien unter `lamp/` auf Ihren LAMP‑Server deployen. Es gibt drei Optionen, den Key zu setzen (in dieser Reihenfolge geprüft):
1. Environment‑Variable (z. B. via `.htaccess` `SetEnv`):
   ```apache
   <IfModule mod_env.c>
   SetEnv OPENROUTER_API_KEY "sk-or-..."
   SetEnv TMDB_API_KEY "TMDB_BEARER_OR_V4_TOKEN"
   </IfModule>
   ```
2. Cloudron‑Pfad (persistenter Speicher): `/app/data/secret.ini`
3. Lokale Datei neben dem Skript: `lamp/secret.ini` (nur zu Testzwecken, nicht ins Repo!)

Beispiel‑INI (`lamp/secret.sample.ini`):
```ini
OPENROUTER_API_KEY=sk-or-REPLACE_ME
TMDB_API_KEY=REPLACE_ME_TMDB_BEARER_OR_V4_TOKEN
```

### 4) CORS
Der Proxy sendet CORS‑Header und muss die exakte Origin der GitHub‑Pages‑Seite erlauben:
```http
Access-Control-Allow-Origin: https://rstockm.github.io
Access-Control-Allow-Methods: POST, GET, OPTIONS
Access-Control-Allow-Headers: Content-Type
```
Falls lokale Tests nötig sind, können zusätzlich `http://localhost:8000` und `http://127.0.0.1:8000` erlaubt werden.

### 5) Proxy‑Routen
- OpenRouter (POST):
  - URL: `https://<Ihre-Domain>/openrouter_proxy.php`
  - Body (Beispiel):
    ```json
    {
      "model": "anthropic/claude-3.5-sonnet",
      "messages": [
        { "role": "system", "content": "..." },
        { "role": "user", "content": "..." }
      ]
    }
    ```
- TMDB (GET, whitelisted: `search/multi`):
  - URL: `https://<Ihre-Domain>/openrouter_proxy.php?service=tmdb&query=<Suchbegriff>&language=de-DE&page=1&include_adult=false`

## Lokale Entwicklung
```bash
# Im Projektverzeichnis
python3 -m http.server 8000
# Browser: http://localhost:8000
```
Hinweis: Für KI‑Parsing und TMDB‑Suche muss der Proxy korrekt konfiguriert sein (CORS & Keys), sonst schlägt die Anfrage im Browser fehl.

## Deployment
### GitHub Pages
- Branch `main`, Pfad `/`
- Live‑URL: [https://rstockm.github.io/personasearch/](https://rstockm.github.io/personasearch/)

### Proxy (LAMP / Cloudron)
1. `lamp/` auf den Server deployen
2. Keys per `SetEnv` oder `/app/data/secret.ini` setzen
3. CORS‑Origin exakt auf `https://rstockm.github.io` konfigurieren
4. Optional: weitere TMDB‑Endpunkte whitelisten (derzeit nur `search/multi`)

## Verwendete Technologien & APIs
- Frontend: HTML, CSS (Bootstrap 5), JavaScript
- KI: OpenRouter (Claude 3.5 Sonnet)
- Bücher: OpenLibrary
- Filme/Serien: TMDB

## Hinweise
- Bitte keine echten Secrets in das öffentliche Repository committen.
- Der Proxy ist minimal gehalten und erlaubt gezielt nur die benötigten Endpunkte. Erweiterungen sollten bewusst und mit Whitelist erfolgen.

# personasearch
Mockup für eine Suche die Persona-basiert konzipiert ist, unterstützt durch ein LLM
