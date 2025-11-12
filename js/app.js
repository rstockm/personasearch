document.addEventListener('DOMContentLoaded', function() {
    const searchForm = document.getElementById('searchForm');
    const searchInput = document.getElementById('searchInput');
    const resultsDiv = document.getElementById('results');
    const queryTabs = document.getElementById('queryTabs');

    // System Prompt für die LLM
    const SYSTEM_PROMPT = `Du bist ein Experte für Buch- und Filmrecherche. Deine Aufgabe ist es, natürlichsprachige Suchanfragen zu analysieren und in strukturierte Suchen umzuwandeln.

Es gibt fünf mögliche Sucheinstiege:
1. Titelsuche - für Suchen nach Buchtiteln oder Teilen davon
2. Autorensuche - für Suchen nach Autoren oder Informationen über Autoren
3. Genre-Suche - für Suchen nach Literaturkategorien oder Themengebieten
4. Erweiterte Suche - für komplexe Suchen, die mehrere Aspekte kombinieren
5. Film-Suche - für Suchen nach Filmen, Regisseuren oder Schauspielern

Analysiere die gewünschte Sortierung:
- Standardmäßig wird IMMER nach Relevanz sortiert (sortByDate = false)
- NUR wenn die Anfrage explizit Begriffe wie "neueste", "neue", "aktuelle" enthält, wird nach Erscheinungsdatum sortiert (sortByDate = true)
- Beispiele für Datumssortierung:
  - "Neue Harry Potter Bücher" -> sortByDate = true
  - "Aktuelle Fantasy Romane" -> sortByDate = true
- Beispiele für Relevanzsortierung:
  - "Harry Potter" -> sortByDate = false
  - "Fantasy Bücher" -> sortByDate = false

Liefere ein JSON-Objekt mit drei Feldern zurück:
- "searchType": einer der Werte "title", "author", "genre", "advanced" oder "movie"
- "searchTerm": der optimale Suchbegriff für die API
- "sortByDate": true wenn nach Datum sortiert werden soll, false für Relevanz-Sortierung

Antworte NUR mit dem JSON-Objekt, ohne weitere Erklärungen.`;

    // Aktiver Prompt für die aktuelle Browser-Session (überschreibbar)
    let activeSystemPrompt = SYSTEM_PROMPT;

    // Elemente für Prompt-Bearbeitung
    const promptModalEl = document.getElementById('promptModal');
    const promptTextarea = document.getElementById('promptTextarea');
    const savePromptButton = document.getElementById('savePromptButton');

    if (promptModalEl && promptTextarea) {
        promptModalEl.addEventListener('show.bs.modal', () => {
            promptTextarea.value = activeSystemPrompt;
        });
    }

    if (savePromptButton && promptModalEl && promptTextarea) {
        savePromptButton.addEventListener('click', () => {
            activeSystemPrompt = promptTextarea.value;
            const instance = bootstrap.Modal.getOrCreateInstance(promptModalEl);
            instance.hide();
        });
    }

    // API-Endpunkte für verschiedene Suchen
    const endpoints = {
        title: (query, sortByDate) => `https://openlibrary.org/search.json?title=${encodeURIComponent(query)}&limit=25${sortByDate ? '&sort=new' : ''}`,
        author: (query, sortByDate) => `https://openlibrary.org/search.json?author=${encodeURIComponent(query)}&limit=25${sortByDate ? '&sort=new' : ''}`,
        genre: (query, sortByDate) => `https://openlibrary.org/search.json?subject=${encodeURIComponent(query)}&limit=25${sortByDate ? '&sort=new' : ''}`,
        advanced: (query, sortByDate) => `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=25${sortByDate ? '&sort=new' : ''}`,
        movie: (query) => `https://follow.wolkenbar.de/openrouter_proxy.php?service=tmdb&query=${encodeURIComponent(query)}&language=de-DE&page=1&include_adult=false`
    };

    // Hilfsfunktion für verzögerte Ausführung
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

    // Funktion zum Durchführen der API-Suche mit Retry-Logik
    async function performSearch(searchType, searchTerm, sortByDate = false, retryCount = 3) {
        const apiUrl = endpoints[searchType](searchTerm, sortByDate);
        console.log('API URL:', apiUrl);

        for (let attempt = 1; attempt <= retryCount; attempt++) {
            try {
                const headers = {}; // Proxy übernimmt Authentifizierung

                const response = await fetch(apiUrl, { headers });

                if (!response.ok) {
                    const errorText = await response.text();
                    if (attempt < retryCount) {
                        console.log(`Versuch ${attempt} fehlgeschlagen, warte vor erneutem Versuch...`);
                        await delay(1000 * attempt); // Exponentielles Backoff
                        continue;
                    }
                    throw new Error(`API-Anfrage fehlgeschlagen (Versuch ${attempt}/${retryCount}): ${response.status} ${response.statusText}\nURL: ${apiUrl}\nAntwort: ${errorText}`);
                }

                const data = await response.json();
                
                if (searchType === 'movie') {
                    const filteredResults = data.results.filter(item => 
                        item.media_type === 'movie' || item.media_type === 'tv'
                    );
                    if (sortByDate) {
                        filteredResults.sort((a, b) => {
                            const dateA = a.release_date || a.first_air_date || '';
                            const dateB = b.release_date || b.first_air_date || '';
                            return dateB.localeCompare(dateA);
                        });
                    }
                    return { 
                        docs: filteredResults, 
                        num_found: filteredResults.length 
                    };
                }
                
                return data;
            } catch (error) {
                if (attempt === retryCount) {
                    console.error('Fehler bei der API-Anfrage:', error);
                    throw error;
                }
                console.log(`Fehler bei Versuch ${attempt}, versuche erneut...`);
                await delay(1000 * attempt);
            }
        }
    }

    // Funktion zum Parsen der natürlichsprachigen Anfrage
    async function parseNaturalLanguageQuery(query) {
        try {
            const response = await fetch('https://follow.wolkenbar.de/openrouter_proxy.php', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: 'anthropic/claude-3.5-sonnet',
                    messages: [
                        { role: 'system', content: activeSystemPrompt },
                        { role: 'user', content: query }
                    ]
                })
            });

            if (!response.ok) {
                throw new Error('LLM-Anfrage fehlgeschlagen');
            }

            const data = await response.json();
            const result = JSON.parse(data.choices[0].message.content);
            
            // Aktiviere den entsprechenden Tab
            const tab = document.querySelector(`#${result.searchType}-tab`);
            if (tab) {
                const tabInstance = new bootstrap.Tab(tab);
                tabInstance.show();
            }

            return result;
        } catch (error) {
            console.error('Fehler beim Parsen der Anfrage:', error);
            throw error;
        }
    }

    searchForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const searchQuery = searchInput.value.trim();
        if (!searchQuery) {
            alert('Bitte geben Sie einen Suchbegriff ein.');
            return;
        }

        // Lade-Animation anzeigen
        resultsDiv.innerHTML = `
            <div class="text-center">
                <div class="spinner-border text-primary" role="status">
                    <span class="visually-hidden">Lädt...</span>
                </div>
                <p class="mt-2">Analysiere Suchanfrage...</p>
            </div>
        `;

        try {
            const parsedQuery = await parseNaturalLanguageQuery(searchQuery);
            console.log('Parsed Query:', parsedQuery);

            // Aktualisiere den Inhalt des KI-Analyse Modals direkt nach der Analyse
            try {
                const aiAnalysisElement = document.getElementById('aiAnalysis');
                if (!aiAnalysisElement) {
                    console.error('aiAnalysis Element nicht gefunden');
                    return;
                }
                const formattedJson = JSON.stringify(parsedQuery, null, 2);
                console.log('Formatierte JSON für Modal:', formattedJson);
                aiAnalysisElement.innerHTML = `
                    <pre class="mb-0"><code>${formattedJson}</code></pre>
                `;
                console.log('Modal-Inhalt wurde aktualisiert');
            } catch (modalError) {
                console.error('Fehler beim Aktualisieren des Modals:', modalError);
            }

            resultsDiv.innerHTML = `
                <div class="text-center">
                    <div class="spinner-border text-primary" role="status">
                        <span class="visually-hidden">Lädt...</span>
                    </div>
                    <p class="mt-2">Suche ${parsedQuery.searchType === 'movie' ? 'Filme' : 'Bücher'}...</p>
                </div>
            `;

            const data = await performSearch(parsedQuery.searchType, parsedQuery.searchTerm, parsedQuery.sortByDate);
            console.log('Results:', data);

            if (!data.docs || data.docs.length === 0) {
                resultsDiv.innerHTML = `
                    <div class="alert alert-info">
                        Keine ${parsedQuery.searchType === 'movie' ? 'Filme' : 'Bücher'} gefunden für: "${parsedQuery.searchTerm}"
                    </div>
                `;
                return;
            }

            // Ergebnisse anzeigen
            if (parsedQuery.searchType === 'movie') {
                resultsDiv.innerHTML = `
                    <div class="alert alert-success">
                        <i class="bi bi-info-circle"></i> Interpretiere "${searchQuery}" als Film-Suche nach "${parsedQuery.searchTerm}"
                        ${parsedQuery.sortByDate ? ' (sortiert nach Erscheinungsdatum)' : ' (sortiert nach Relevanz)'}
                    </div>
                    <div class="table-responsive">
                        <table class="table table-striped table-hover">
                            <thead class="table-dark">
                                <tr>
                                    <th>Titel</th>
                                    <th>Original Titel</th>
                                    <th>Typ</th>
                                    <th>Erscheinungsdatum</th>
                                    <th>Bewertung</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${data.docs.map(item => {
                                    const isMovie = item.media_type === 'movie';
                                    const title = item.title || item.name;
                                    const originalTitle = item.original_title || item.original_name;
                                    const releaseDate = item.release_date || item.first_air_date;
                                    const type = isMovie ? 'Film' : 'TV-Serie';
                                    const link = `https://www.themoviedb.org/${item.media_type}/${item.id}`;
                                    
                                    return `
                                        <tr>
                                            <td>
                                                <a href="${link}"
                                                   target="_blank" 
                                                   class="text-decoration-none">
                                                    ${title}
                                                    <i class="bi bi-box-arrow-up-right ms-1 small"></i>
                                                </a>
                                            </td>
                                            <td>${originalTitle}</td>
                                            <td>${type}</td>
                                            <td>${releaseDate || '-'}</td>
                                            <td>${item.vote_average ? item.vote_average.toFixed(1) + '/10' : '-'}</td>
                                        </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                    <div class="mt-3 text-muted">
                        <small>Gefunden: ${data.docs.length} Ergebnisse</small>
                    </div>
                `;
            } else {
                // Bestehende Anzeige für Bücher
                const searchTypeNames = {
                    'title': 'Titel',
                    'author': 'Autor',
                    'genre': 'Genre',
                    'advanced': 'Erweiterte'
                };
                resultsDiv.innerHTML = `
                    <div class="alert alert-success">
                        <i class="bi bi-info-circle"></i> Interpretiere "${searchQuery}" als ${searchTypeNames[parsedQuery.searchType]}-Suche nach "${parsedQuery.searchTerm}"
                        ${parsedQuery.sortByDate ? ' (sortiert nach Erscheinungsdatum)' : ' (sortiert nach Relevanz)'}
                    </div>
                    <div class="table-responsive">
                        <table class="table table-striped table-hover">
                            <thead class="table-dark">
                                <tr>
                                    <th style="width: 60px;">Cover</th>
                                    <th>Titel</th>
                                    <th>Autor(en)</th>
                                    <th>ISBN</th>
                                    <th>Erscheinungsjahr</th>
                                    ${parsedQuery.searchType === 'genre' ? '<th>Genres</th>' : ''}
                                </tr>
                            </thead>
                            <tbody>
                                ${data.docs.map(book => {
                                    const isbn = book.isbn ? book.isbn[0] : '-';
                                    const authors = book.author_name ? book.author_name.join(', ') : '-';
                                    const year = book.first_publish_year || '-';
                                    const subjects = book.subject ? book.subject.slice(0, 3).join(', ') : '-';
                                    
                                    // Cover URL generieren
                                    const coverId = book.cover_i;
                                    const coverUrlSmall = coverId 
                                        ? `https://covers.openlibrary.org/b/id/${coverId}-S.jpg`
                                        : 'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/icons/book.svg';
                                    const coverUrlMedium = coverId 
                                        ? `https://covers.openlibrary.org/b/id/${coverId}-M.jpg`
                                        : 'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/icons/book.svg';
                                    
                                    return `
                                        <tr>
                                            <td class="text-center">
                                                <img src="${coverUrlSmall}" 
                                                     alt="Cover: ${book.title}"
                                                     class="img-fluid cover-preview"
                                                     style="max-width: 50px; height: auto; cursor: pointer;"
                                                     data-bs-toggle="popover"
                                                     data-bs-trigger="hover"
                                                     data-bs-html="true"
                                                     data-bs-content="<img src='${coverUrlMedium}' class='img-fluid' style='max-width: 200px;'>"
                                                     onerror="this.onerror=null; this.src='https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/icons/book.svg';">
                                            </td>
                                            <td>
                                                <a href="https://openlibrary.org${book.key}"
                                                   target="_blank" 
                                                   class="text-decoration-none">
                                                    ${book.title}
                                                    <i class="bi bi-box-arrow-up-right ms-1 small"></i>
                                                </a>
                                            </td>
                                            <td>${authors}</td>
                                            <td>${isbn}</td>
                                            <td>${year}</td>
                                            ${parsedQuery.searchType === 'genre' ? `<td>${subjects}</td>` : ''}
                                        </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                    <div class="mt-3 text-muted">
                        <small>Gefunden: ${data.docs.length} von ${data.num_found} Büchern</small>
                    </div>
                `;

                // Initialisiere Popovers für Cover-Vorschauen
                const popovers = document.querySelectorAll('[data-bs-toggle="popover"]');
                popovers.forEach(popover => {
                    new bootstrap.Popover(popover, {
                        placement: 'right',
                        delay: { show: 50, hide: 100 }
                    });
                });
            }
        } catch (error) {
            console.error('Error:', error);
            resultsDiv.innerHTML = `
                <div class="alert alert-danger">
                    <h4 class="alert-heading">Fehler</h4>
                    <p>${error.message}</p>
                    <hr>
                    <p class="mb-0">Bitte versuchen Sie es später erneut.</p>
                </div>
            `;
        }
    });
}); 