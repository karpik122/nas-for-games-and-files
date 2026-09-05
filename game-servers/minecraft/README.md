# Minecraft na KarpikNAS

Konfiguracja uruchamia serwer Minecraft Java Edition w kontenerze `itzg/minecraft-server`. Domyślnie wybrany jest Paper, port `25565` i limit pamięci 4 GB. Świat oraz ustawienia gry są przechowywane trwale w katalogu `data`.

## Pierwsze uruchomienie

1. Zainstaluj Docker Desktop na Windowsie albo Docker Engine z dodatkiem Compose na Debianie.
2. Skopiuj `.env.example` jako `.env`.
3. Przeczytaj [Minecraft EULA](https://aka.ms/MinecraftEULA). Jeśli ją akceptujesz, zmień `MINECRAFT_EULA=FALSE` na `MINECRAFT_EULA=TRUE`.
4. Dopasuj pamięć, wersję i port w `.env`.
5. Użyj sekcji **Gry** w panelu KarpikNAS albo uruchom ręcznie:

```powershell
docker compose up -d minecraft
```

Status i logi:

```powershell
docker compose ps
docker compose logs -f minecraft
```

Bezpieczne zatrzymanie z zapisem świata:

```powershell
docker compose stop minecraft
```

RCON jest wyłączony i jego port nie jest publikowany. Panel zarządza wyłącznie całym kontenerem poprzez z góry określone polecenia Docker Compose.

## Terminal serwera

Karta **Terminal** pokazuje ostatnie linie logów i odświeża je automatycznie. Gdy serwer działa, pole pod terminalem pozwala wysyłać pojedyncze komendy Minecraft, na przykład `list`, `say Przerwa za 5 minut` albo `whitelist add NazwaGracza`.

Komendy są przekazywane do `mc-send-to-console` przez wewnętrzny potok kontenera. Nie są uruchamiane w PowerShellu ani Bashu, a port RCON nie jest wystawiony. Terminal jest chroniony tą samą sesją administratora co pozostała część panelu.

Po aktualizacji istniejącego serwera zatrzymaj go i uruchom ponownie z panelu, aby Docker odtworzył kontener z włączonym wewnętrznym potokiem konsoli.

## Baza danych dla pluginów

Compose uruchamia również MariaDB w kontenerze `karpiknas-minecraft-db`. Baza nie ma portu dostępnego z sieci domowej ani internetu; widzi ją tylko sieć kontenerów tej gry. Dane połączenia dla pluginu:

- host: `database`
- port: `3306`
- baza: `minecraft` (lub wartość `MINECRAFT_DB_NAME`)
- użytkownik: `minecraft` (lub wartość `MINECRAFT_DB_USER`)
- hasło: plik `.secrets/minecraft_db_password`

Hasła są generowane automatycznie i nie trafiają do repozytorium. Wolumin `minecraft-db-data` zachowuje bazę po odtworzeniu kontenera. Minecraft bez pluginów nie korzysta z SQL samodzielnie — dane połączenia trzeba wpisać w konfiguracji pluginu, który obsługuje MySQL/MariaDB.

## Pluginy i edycja konfiguracji

Po zalogowaniu przejdź do **Panel → Gry**:

- karta **Pluginy** przyjmuje pliki `.jar` dla Paper/Spigot (maksymalnie 100 MB),
- karta **Pliki serwera** pozwala przeglądać `data` i edytować bezpieczne formaty tekstowe, między innymi `server.properties`, YAML, JSON, TOML, CFG, CONF, INI i TXT,
- edytor nie udostępnia plików binarnych, dowiązań symbolicznych ani ścieżek spoza katalogu `data`.

Pluginy są zapisywane w `data/plugins`. Po dodaniu pluginu albo zmianie konfiguracji uruchom serwer ponownie, aby ustawienia zostały wczytane.
