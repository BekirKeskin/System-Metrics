# SYSTEM METRICS

Windows ve Linux sunucuların sistem metriklerini merkezi olarak izlemek için geliştirilen monitoring projesi.

Proje; çoklu sunucu izleme, Linux agent bağlantısı, gerçek zamanlı metrik aktarımı, PostgreSQL üzerinde metric geçmişi, alarm sistemi, kullanıcı yetkilendirmesi ve otomatik backend testlerini içerir.

---

# PROJE YAPISI

```text
System-Metrics/
├── Agent/          # Linux monitoring agent
├── Backend/        # Node.js merkezi backend
├── Frontend/       # Angular dashboard
└── README.md
```

Backend tarafında route, handler, middleware ve service sorumlulukları ayrılmıştır.

```text
Backend/
├── handlers/
│   ├── alarm/
│   ├── auth/
│   └── user/
│
├── middleware/
│
├── routes/
│   ├── alarm-routes.js
│   ├── auth-routes.js
│   ├── user-routes.js
│   ├── metric-routes.js
│   └── http-router.js
│
├── services/
│   └── auth/
│
├── migrations/
├── tests/
├── db.js
├── schema.sql
└── server.js
```

---




# KURULUM VE ÇALIŞTIRMA

## Gereksinimler

Projeyi çalıştırmak için temel olarak:

* Node.js
* PostgreSQL
* Angular CLI
* Linux Agent kullanılacaksa Linux sunucu veya sanal makine

gereklidir.

---

## Backend

Backend klasörüne girilir:

```bash
cd Backend
```

Bağımlılıklar yüklenir:

```bash
npm install
```

Backend için `.env` dosyasında gerekli ortam değişkenleri tanımlanmalıdır.

Örnek:

```env
DB_HOST=...
DB_PORT=5432
DB_NAME=system_metrics
DB_TEST_NAME=system_metrics_test
DB_USER=...
DB_PASSWORD=...
JWT_SECRET=...
```

Gerçek parola, JWT secret ve agent secret değerleri Git reposuna eklenmemelidir.

PostgreSQL üzerinde ana veritabanı oluşturulduktan sonra güncel tablo yapısı için:

```text
Backend/schema.sql
```

dosyası çalıştırılmalıdır.

Backend başlatılır:

```bash
node server.js
```

Backend varsayılan olarak:

```text
http://localhost:3000
```

adresinde çalışır.

---

## Frontend

Frontend klasörüne girilir:

```bash
cd Frontend
```

Bağımlılıklar yüklenir:

```bash
npm install
```

Angular geliştirme sunucusu başlatılır:

```bash
ng serve
```

Frontend varsayılan olarak:

```text
http://localhost:4200
```

adresinde çalışır.

---

## Linux Agent

Agent klasörüne girilir:

```bash
cd Agent
```

Bağımlılıklar yüklenir:

```bash
npm install
```

Agent tarafında gerekli backend adresi, agent kimliği ve secret bilgileri yapılandırılır.

Agent başlatılır:

```bash
node index.js
```

Agent çalıştığında Linux sunucunun sistem bilgilerini ve metriklerini Socket.IO üzerinden merkezi backend'e göndermeye başlar.

---

## Backend Testleri

Testler normal geliştirme veritabanından ayrı bir PostgreSQL veritabanı kullanır:

```text
system_metrics_test
```

Test veritabanı oluşturulduktan sonra aynı güncel:

```text
Backend/schema.sql
```

dosyası test veritabanında da çalıştırılmalıdır.

`.env` içerisinde:

```env
DB_TEST_NAME=system_metrics_test
```

tanımlanmalıdır.

Backend klasöründe tüm otomatik testler:

```bash
npm test
```

komutuyla çalıştırılır.




# MİMARİ

```text
Windows Host
├── Central Backend
├── PostgreSQL
├── Angular Dashboard
└── VMware Workstation
      └── Ubuntu Server VM
            └── Monitoring Agent
                    │
                    │ Socket.IO
                    ▼
              Central Backend
```

Linux Agent, çalıştığı sunucunun sistem bilgilerini ve metriklerini toplar ve Socket.IO üzerinden merkezi backend'e gönderir.

Windows host üzerindeki metrikler merkezi backend tarafından doğrudan toplanır.

Backend gelen verileri sunucu kimliğine göre ayırır ve PostgreSQL'de saklar.

Angular dashboard üzerinden kayıtlı Windows ve Linux sunucular arasında geçiş yapılarak metrikler ayrı ayrı görüntülenebilir.

---

# TOPLANAN METRİKLER

* CPU kullanımı
* RAM kullanımı
* Disk okuma hızı
* Disk yazma hızı
* Network alma hızı
* Network gönderme hızı
* Network kullanım yüzdesi

Ayrıca sunucular için aşağıdaki sistem bilgileri tutulur:

* Hostname
* İşletim sistemi
* Fiziksel çekirdek sayısı
* Mantıksal işlemci sayısı
* Toplam RAM
* Network interface
* Network interface hızı
* Son görülme zamanı
* Online / Offline durumu

---

# LINUX TEST ORTAMI

Linux tarafı gerçek bir Ubuntu Server kurulumu üzerinde test edilmiştir.

Test ortamı:

* VMware Workstation
* Ubuntu Server VM
* Node.js monitoring agent
* SSH üzerinden yönetim
* Linux network interface: `ens33`

Linux'taki metrik kaynakları ayrıca işletim sistemi seviyesinde incelenmiştir:

* CPU: `/proc/stat`
* RAM: `/proc/meminfo`
* Disk I/O: `/proc/diskstats`
* Network: `/proc/net/dev`
* Network interface bilgileri: `/sys`

Agent tarafında cross-platform metrik toplamak için `systeminformation` NPM paketi kullanılmaktadır.

---

# ÇOKLU SUNUCU DESTEĞİ

Her sunucu PostgreSQL'deki `servers` tablosunda ayrı bir `serverId` ile tutulur.

Bu sayede Windows host ve Linux agent tarafından gönderilen metrikler birbirine karışmadan saklanır.

Dashboard üzerinden aktif sunucu seçilerek ilgili sunucunun sistem bilgileri ve metrikleri görüntülenebilir.

Sunucuların son bağlantı zamanı `lastSeen` bilgisi üzerinden takip edilir.

---

# AGENT AUTHENTICATION

Linux agent merkezi backend'e bağlanırken kimlik doğrulaması yapar.

Agent bağlantısında:

* Kalıcı agent kimliği
* Agent secret
* Server kimliği

kullanılır.

Agent secret doğrudan veritabanında tutulmaz. SHA-256 hash değeri saklanır ve bağlantı sırasında doğrulama yapılır.

Yanlış secret ile bağlantının backend tarafından reddedildiği test edilmiştir.

`.env`, `.agent-id` ve `node_modules` Git reposuna dahil edilmez.

---

# HEARTBEAT

Agent backend'e periyodik heartbeat gönderir.

Heartbeat bilgisine göre sunucular:

* Online
* Offline

olarak işaretlenir.

Böylece metrik gönderimi durmuş olsa bile agent'ın bağlantı durumu ayrıca takip edilebilir.

---

# DATABASE

Projede PostgreSQL kullanılmaktadır.

Temel tablolar:

```text
users
servers
alarms
metrics
refresh_tokens
```

## users

Kullanıcı bilgileri ve roller tutulur.

Roller:

```text
admin
user
```

Kullanıcı şifreleri doğrudan saklanmaz. bcrypt ile oluşturulan hash değerleri tutulur.

## servers

Monitoring sistemine kayıtlı Windows ve Linux sunucuların bilgileri tutulur.

Linux agent authentication için `agent_secret_hash` alanı da bu tabloda bulunmaktadır.

## metrics

Sunuculardan toplanan metric geçmişi tutulur.

Her metric kaydı bir `server_id` ile ilgili sunucuya bağlıdır.

Sunucu silindiğinde ona ait metric kayıtlarının da silinmesi için foreign key üzerinde `ON DELETE CASCADE` kullanılmaktadır.

## alarms

Kullanıcıların belirli bir sunucu için oluşturduğu CPU ve RAM alarm kuralları tutulur.

Alarm bir:

* Sunucu
* Kullanıcı
* Metric türü
* Threshold
* Severity

bilgisine bağlıdır.

## refresh_tokens

Refresh Token oturumları tutulur.

Veritabanında gerçek Refresh Token yerine SHA-256 hash değeri saklanır.

Tabloda ayrıca:

* User ID
* Session ID
* Token hash
* Expire zamanı
* Revoke zamanı
* Yerine oluşturulan token hash'i

bilgileri bulunur.

---

# DATABASE MIGRATIONS

Veritabanının zaman içinde geçirdiği şema değişiklikleri `Backend/migrations` klasöründe tutulur.

Migration örnekleri:

* Alarm tablosuna `server_id` eklenmesi
* Servers tablosuna `agent_secret_hash` eklenmesi
* Refresh Token tablosunun oluşturulması

Yeni bir veritabanı sıfırdan kurulurken güncel yapı için `schema.sql` kullanılabilir.

Migration dosyaları ise mevcut eski bir veritabanını yeni şemaya geçirmek için kullanılır.

---

# ALARM SİSTEMİ

Admin panel üzerinden CPU ve RAM için alarm oluşturulabilir.

Alarm üzerinde:

* Oluşturma
* Listeleme
* Güncelleme
* Silme
* Aktif / pasif yapma

işlemleri gerçekleştirilebilir.

Alarm bir kullanıcıya ve belirli bir sunucuya bağlıdır.

Threshold aşıldığında alarm sistemi e-posta gönderebilir.

Aynı alarmın sürekli e-posta göndermesini engellemek için cooldown sistemi kullanılmaktadır.

---

# JWT AUTHENTICATION

Frontend kullanıcı authentication sisteminde JWT kullanılmaktadır.

Sistem iki token türü kullanır:

```text
Access Token  → 15 dakika
Refresh Token → 7 gün
```

Access Token frontend tarafından API isteklerinde kullanılır.

Refresh Token ise JavaScript tarafından okunamaması için `HttpOnly` cookie içerisinde tutulur.

Cookie özellikleri:

* `HttpOnly`
* `SameSite=Strict`
* `Path=/`
* Production ortamında `Secure`

Admin endpointleri ayrıca kullanıcının `admin` rolüne sahip olup olmadığını kontrol eder.

---

# REFRESH TOKEN ROTATION

Refresh Token kullanıldığında eski token tekrar kullanılmaya devam etmez.

Akış:

```text
Refresh Token kullanılır
        ↓
Eski token revoke edilir
        ↓
Yeni Refresh Token oluşturulur
        ↓
Aynı session_id ile kaydedilir
        ↓
Yeni Access Token oluşturulur
```

Eski bir Refresh Token tekrar kullanılmaya çalışılırsa replay detection uygulanır.

Bu durumda aynı session içerisindeki aktif Refresh Token'lar da revoke edilir.

---

# LOGOUT

Logout işlemi yalnızca frontend localStorage temizliği değildir.

`POST /logout` sırasında:

* Refresh Token cookie okunur
* Token hash'i hesaplanır
* İlgili token veritabanında revoke edilir
* Refresh Token cookie temizlenir
* Frontend authentication bilgileri temizlenir
* Kullanıcı login ekranına yönlendirilir

---

# OTOMATİK ACCESS TOKEN YENİLEME

Angular HTTP interceptor, Access Token süresi dolduğunda otomatik olarak Refresh Token akışını çalıştırır.

```text
Korumalı HTTP isteği
        ↓
401 Unauthorized
        ↓
POST /refresh
        ↓
Yeni Access Token
        ↓
Eski istek yeni token ile tekrar gönderilir
```

Böylece geçerli Refresh Token bulunduğu sürece kullanıcı tekrar login olmak zorunda kalmaz.

---

# MERKEZİ HTTP ROUTER

Backend HTTP route yapısı merkezi bir route registry üzerinden çalışmaktadır.

Her route için temel bilgiler aynı yerde tutulur:

```text
HTTP Method
Path
Access
Handler
```

Örnek:

```js
{
    method: "GET",
    path: "/admin/users",
    access: "admin",
    handler: handleGetUsers
}
```

Route erişim türleri:

```text
public
authenticated
admin
```

Sabit endpointler string karşılaştırması ile bulunur.

Dinamik endpointlerde Regex kullanılmaktadır.

Örneğin:

```text
PUT /admin/alarms/12
DELETE /admin/alarms/12
```

route'ları merkezi router tarafından Regex ile eşleştirilir ve alarm ID değeri handler'a aktarılır.

Bu yapı sayesinde önceki ayrı:

* Public route döngüsü
* Access rule döngüsü
* Protected route döngüsü
* Dynamic alarm route döngüsü

yerine route bulma işlemi tek merkezi registry ve tek route döngüsü üzerinden gerçekleştirilir.

Bilinmeyen endpointler:

```text
404 Not Found
```

cevabı döndürür.

---

# CPU HISTORY

CPU metric geçmişi PostgreSQL'den alınabilir.

Endpoint:

```text
GET /metrics/cpu-history
```

Query parametreleri:

```text
serverId
limit
```

Endpoint geçerli JWT gerektirir.

Angular dashboard üzerindeki CPU kartında Chart.js kullanılarak küçük bir history grafiği gösterilir.

Grafik:

* PostgreSQL'den geçmiş CPU verilerini alır
* Socket.IO ile gelen yeni değerleri canlı olarak ekler
* Son 60 veri noktasını tutar

---

# BACKEND OTOMATİK TESTLERİ

Backend tarafında Node.js'in yerleşik `node:test` test runner'ı kullanılmaktadır.

Assertion işlemleri için `node:assert/strict` kullanılmaktadır.

Testleri çalıştırmak için:

```bash
npm test
```

komutu yeterlidir.

Testler normal geliştirme veritabanını kullanmaz.

Ayrı bir:

```text
system_metrics_test
```

PostgreSQL veritabanı kullanılmaktadır.

Test ortamında:

```text
NODE_ENV=test
```

olduğunda backend `DB_TEST_NAME` üzerinden test veritabanına bağlanır.

Otomatik testlerde kontrol edilen başlıca alanlar:

* Merkezi HTTP router
* HTTP `200`, `400`, `401`, `403`, `404` davranışları
* Yanlış HTTP method
* Regex dynamic route eşleşmeleri
* JWT doğrulaması
* Süresi dolmuş JWT
* Yanlış JWT secret
* Admin authorization
* PostgreSQL test DB izolasyonu
* Database tabloları
* Insert işlemleri
* Foreign key CASCADE davranışı
* Gerçek login işlemi
* bcrypt doğrulaması
* JWT üretimi
* Refresh Token cookie
* Refresh Token Rotation
* Replay Detection
* Logout ve token revoke
* Alarm CRUD işlemleri
* CPU history
* Admin kullanıcı listesi

Testlerde oluşturulan geçici kullanıcı, sunucu, alarm ve metric verileri test sonrasında temizlenmektedir.

---

# FRONTEND

Frontend Angular ile geliştirilmiştir.

Dashboard üzerinde:

* Sunucu seçimi
* Online / Offline bilgisi
* Sistem bilgileri
* CPU
* RAM
* Disk I/O
* Network
* CPU history grafiği

görüntülenebilir.

Admin rolündeki kullanıcılar Admin Panel üzerinden:

* Kullanıcıları
* Alarmları

yönetebilir.

---

# KULLANILAN TEMEL TEKNOLOJİLER

## Backend

* Node.js
* `node:http`
* Socket.IO
* PostgreSQL
* `pg`
* JWT
* bcrypt
* dotenv
* Nodemailer
* Node.js `node:test`

## Frontend

* Angular
* Socket.IO Client
* Chart.js

## Linux Agent

* Node.js
* Socket.IO Client
* systeminformation

## Test / Sanallaştırma

* PostgreSQL test database
* VMware Workstation
* Ubuntu Server
* SSH
