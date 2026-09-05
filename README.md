# KarpikNAS 0.1

Pierwsza wersja panelu domowego NAS rozwijana i testowana na Windowsie. Zawiera publiczną stronę główną, logowanie administratora, chroniony dashboard systemowy, menedżer plików testowego magazynu oraz testowy widok dysków.

## Struktura

- `apps/web` — panel React + Vite
- `apps/api` — API Fastify + TypeScript
- `dev-storage` — bezpieczny magazyn testowy (`Projekty`, `Multimedia`, `Backup`)
- `game-servers/minecraft` — Docker Compose, konfiguracja i trwałe dane Minecrafta

Frontend jest podzielony na trzy strony:

- `/` — strona główna
- `/login` — logowanie administratora
- `/panel` — chroniony panel NAS

## Automatyczna instalacja na Debianie

Instalator obsługuje Debiana 12 i 13. Uruchom go z katalogu projektu:

```bash
sudo bash install/debian/install.sh
```

Instalator automatycznie:

- instaluje zweryfikowany Node.js 24, Nginx oraz oficjalny Docker Engine z Compose,
- kopiuje aplikację do `/opt/karpiknas` i tworzy użytkownika systemowego `karpiknas`,
- buduje frontend i backend oraz uruchamia je jako usługę `karpiknas.service`,
- tworzy magazyn w `/srv/karpiknas/storage`,
- generuje bezpieczne hasło administratora,
- tworzy SQLite w `/var/lib/karpiknas/karpiknas.sqlite` i wykonuje migracje,
- generuje sekrety oraz uruchamia MariaDB dla pluginów Minecraft,
- konfiguruje Nginx na porcie 80.

Minecraft EULA nie jest akceptowana automatycznie. Jeśli wcześniej ją przeczytałeś i akceptujesz, możesz uruchomić:

```bash
sudo bash install/debian/install.sh --accept-minecraft-eula
```

Po instalacji panel jest dostępny pod adresem IP Debiana. Wygenerowane hasło administratora zostanie pokazane jeden raz; później znajduje się w `/etc/karpiknas/karpiknas.env` dostępnym wyłącznie dla administratora systemu.

Domyślna konfiguracja HTTP jest przeznaczona dla zaufanej sieci lokalnej. Nie przekierowuj portu 80 panelu na internet; przed dostępem zdalnym dodaj HTTPS i VPN albo tunel z kontrolą dostępu.

Przydatne polecenia:

```bash
sudo systemctl status karpiknas
sudo systemctl restart karpiknas
sudo journalctl -u karpiknas -f
```

SQLite przechowuje ustawienia i historię operacji KarpikNAS. MariaDB działa w osobnym kontenerze `karpiknas-minecraft-db`, ma trwały wolumin i nie publikuje portu `3306`. Minecraft łączy się z nią po prywatnej sieci Compose przez host `database`. Konkretne pluginy nadal wymagają wpisania tych danych w ich własnym pliku konfiguracyjnym.

## Uruchomienie na Windowsie

W pierwszym terminalu:

```powershell
cd "D:\xx\serverfor games and files\apps\api"
npm run dev
```

W drugim terminalu:

```powershell
cd "D:\xx\serverfor games and files\apps\web"
npm run dev
```

Panel będzie dostępny pod adresem [http://localhost:5173](http://localhost:5173), a API pod adresem [http://127.0.0.1:3001/api/health](http://127.0.0.1:3001/api/health).

W trybie developerskim użyj loginu `admin` i hasła `karpiknas`. Przed uruchomieniem produkcyjnym należy ustawić własne dane:

```powershell
$env:ADMIN_USERNAME = "wlasny-login"
$env:ADMIN_PASSWORD = "dlugie-losowe-haslo"
```

Sesja jest przechowywana w ciasteczku HTTP-only z `SameSite=Strict`, wygasa po 8 godzinach, a chronione endpointy nie zwracają danych bez aktywnej sesji.

## Serwer Minecraft w Dockerze

Panel zawiera sekcję **Gry**, która pokazuje stan kontenera Minecraft, pozwala go uruchomić i bezpiecznie zatrzymać, przeglądać terminal, wysyłać komendy, dodawać pluginy Paper/Spigot oraz edytować tekstowe pliki konfiguracji. Konfiguracja używa obrazu `itzg/minecraft-server`, serwera Paper, portu `25565` i trwałego katalogu świata.

Przed pierwszym uruchomieniem:

```powershell
cd "D:\xx\serverfor games and files\game-servers\minecraft"
Copy-Item .env.example .env
```

Następnie przeczytaj [Minecraft EULA](https://aka.ms/MinecraftEULA). Jeżeli ją akceptujesz, ustaw w `.env`:

```text
MINECRAFT_EULA=TRUE
```

Po zainstalowaniu Docker Desktop serwer można obsługiwać z panelu albo poleceniami:

```powershell
docker compose up -d minecraft
docker compose logs -f minecraft
docker compose stop minecraft
```

Świat gry znajduje się w `game-servers/minecraft/data` i nie jest dodawany do repozytorium. Pluginy `.jar` trafiają do podkatalogu `data/plugins`; istniejący plik nie zostanie nadpisany, a limit jednego pliku wynosi 100 MB. Edytor obsługuje tylko tekstowe formaty konfiguracji do 1 MB i blokuje wyjście poza katalog `data` oraz dowiązania symboliczne. Zmiany konfiguracji i nowe pluginy zaczną działać po ponownym uruchomieniu serwera.

RCON i jego port pozostają wyłączone. Komendy z terminala są przekazywane przez wewnętrzny potok konsoli kontenera i nie trafiają do powłoki systemowej. Widok pobiera maksymalnie 250 ostatnich linii logów co 4 sekundy. Dostęp do terminala ma wyłącznie zalogowany administrator — wysyłaj tylko komendy, których działanie rozumiesz.

Jeżeli lokalny skrót `npm` nadal wskazuje na nieistniejącą instalację w `AppData`, można tymczasowo uruchamiać skrypty przez właściwy plik instalacji Node.js:

```powershell
node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run dev
```

## Magazyn na Debianie

Kod wybiera adapter systemowy automatycznie. Na Debianie ustaw ścieżkę magazynu przed uruchomieniem API:

```bash
STORAGE_ROOT=/srv/storage/patryk npm run start
```

Operacje SMART, RAID, Docker i zarządzanie usługami są celowo odłożone do etapu z bezpiecznym agentem systemowym. Do prezentacji niezależnej od systemu można ustawić `SYSTEM_PROVIDER=mock`.
