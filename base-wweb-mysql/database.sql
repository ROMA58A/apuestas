CREATE DATABASE IF NOT EXISTS bot_whatsapp
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE bot_whatsapp;

CREATE TABLE IF NOT EXISTS history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ref VARCHAR(255) NOT NULL,
    keyword VARCHAR(255) NULL,
    answer LONGTEXT NOT NULL,
    refSerialize VARCHAR(255) NOT NULL,
    phone VARCHAR(255) NOT NULL,
    options LONGTEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS match_results (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    home_team VARCHAR(120) NOT NULL,
    away_team VARCHAR(120) NOT NULL,
    home_score SMALLINT UNSIGNED NOT NULL,
    away_score SMALLINT UNSIGNED NOT NULL,
    competition VARCHAR(160) NULL,
    played_at DATETIME NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_match_results_played_at (played_at),
    INDEX idx_match_results_competition (competition)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS match_watchlist (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    home_team VARCHAR(120) NOT NULL,
    away_team VARCHAR(120) NOT NULL,
    competition VARCHAR(160) NOT NULL DEFAULT '',
    last_home_score SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    last_away_score SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    watch_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    UNIQUE KEY uq_match_watchlist_key (watch_key)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT IGNORE INTO match_watchlist (watch_key, home_team, away_team, competition)
VALUES (
    '55db8327d276afe1fb9f37a04298952ac0a295d3ade5bee37c3d8352bb306dc8',
    'Equipo Ejemplo Local',
    'Equipo Ejemplo Visitante',
    'Liga de ejemplo'
);
