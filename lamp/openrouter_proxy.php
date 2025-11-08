<?php
// CORS-Konfiguration: Passen Sie die Domain auf Ihre GitHub Pages an
$allowedOrigin = 'https://<ihr-github-username>.github.io';
header('Access-Control-Allow-Origin: ' . $allowedOrigin);
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json; charset=utf-8');

// Preflight-Anfrage beantworten
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// Service bestimmen: 'tmdb' (GET) oder Standard 'openrouter' (POST)
$service = $_GET['service'] ?? ($_POST['service'] ?? 'openrouter');

// API-Keys laden
// Reihenfolge:
// 1) Environment (z.B. SetEnv OPENROUTER_API_KEY in .htaccess / vHost)
// 2) Cloudron: /app/data/secret.ini
// 3) Lokale Datei im selben Ordner: secret.ini
$apiKey = getenv('OPENROUTER_API_KEY') ?: null;
$tmdbKey = getenv('TMDB_API_KEY') ?: null;
$candidateFiles = [
    '/app/data/secret.ini',
    __DIR__ . '/secret.ini'
];
foreach ($candidateFiles as $file) {
    if (is_readable($file)) {
        $config = @parse_ini_file($file, false, INI_SCANNER_TYPED);
        if (is_array($config) && !empty($config['OPENROUTER_API_KEY'])) {
            $apiKey = $apiKey ?: $config['OPENROUTER_API_KEY'];
        }
        if (is_array($config) && !empty($config['TMDB_API_KEY'])) {
            $tmdbKey = $tmdbKey ?: $config['TMDB_API_KEY'];
        }
        if ($apiKey && $tmdbKey) {
            break;
        }
    }
}

// TMDB-Proxy (GET): /openrouter_proxy.php?service=tmdb&query=...&language=de-DE&page=1&include_adult=false
if ($service === 'tmdb') {
    if (!$tmdbKey) {
        http_response_code(500);
        echo json_encode(['error' => 'TMDB_API_KEY not configured']);
        exit;
    }
    if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
        http_response_code(405);
        echo json_encode(['error' => 'Method not allowed']);
        exit;
    }
    $query = isset($_GET['query']) ? (string)$_GET['query'] : '';
    if ($query === '') {
        http_response_code(400);
        echo json_encode(['error' => 'Missing query parameter']);
        exit;
    }
    $language = isset($_GET['language']) ? (string)$_GET['language'] : 'de-DE';
    $page = isset($_GET['page']) ? (int)$_GET['page'] : 1;
    $includeAdult = isset($_GET['include_adult']) ? (string)$_GET['include_adult'] : 'false';

    // Whitelist: Nur der Search-Multi-Endpunkt
    $tmdbUrl = 'https://api.themoviedb.org/3/search/multi'
        . '?query=' . rawurlencode($query)
        . '&language=' . rawurlencode($language)
        . '&page=' . rawurlencode((string)$page)
        . '&include_adult=' . rawurlencode($includeAdult);

    $ch = curl_init($tmdbUrl);
    curl_setopt_array($ch, [
        CURLOPT_HTTPGET => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => [
            'Authorization: Bearer ' . $tmdbKey,
            'Accept: application/json',
        ],
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT => 20,
    ]);
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlErr = curl_error($ch);
    curl_close($ch);

    if ($response === false) {
        http_response_code(502);
        echo json_encode(['error' => 'Upstream error', 'details' => $curlErr]);
        exit;
    }
    http_response_code($httpCode ?: 200);
    echo $response;
    exit;
}

// OpenRouter-Proxy (POST)
if (!$apiKey) {
    http_response_code(500);
    echo json_encode(['error' => 'OPENROUTER_API_KEY not configured']);
    exit;
}
// Eingabe einlesen und validieren
$rawBody = file_get_contents('php://input');
if ($rawBody === false || $rawBody === '') {
    http_response_code(400);
    echo json_encode(['error' => 'Empty request body']);
    exit;
}

$payload = json_decode($rawBody, true);
if (!is_array($payload)) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid JSON payload']);
    exit;
}

// Optional: Modell-Whitelist
$allowedModels = ['anthropic/claude-3.5-sonnet'];
if (isset($payload['model']) && !in_array($payload['model'], $allowedModels, true)) {
    http_response_code(400);
    echo json_encode(['error' => 'Model not allowed']);
    exit;
}

// Anfrage an OpenRouter weiterleiten
$ch = curl_init('https://openrouter.ai/api/v1/chat/completions');
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER => [
        'Authorization: Bearer ' . $apiKey,
        'Content-Type: application/json',
        'HTTP-Referer: ' . $allowedOrigin,
        'X-Title: PersonaSearch',
    ],
    CURLOPT_POSTFIELDS => json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
    CURLOPT_CONNECTTIMEOUT => 10,
    CURLOPT_TIMEOUT => 30,
]);
$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlErr = curl_error($ch);
curl_close($ch);

if ($response === false) {
    http_response_code(502);
    echo json_encode(['error' => 'Upstream error', 'details' => $curlErr]);
    exit;
}

http_response_code($httpCode ?: 200);
echo $response;
