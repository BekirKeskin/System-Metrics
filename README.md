	SYSTEM METRICS

Windows ve Linux sunucuların sistem metriklerini merkezi olarak izlemek için geliştirilen monitoring projesi.


	PROJE YAPISI

System-Metrics/
├── Agent/       # Linux monitoring agent
├── Backend/     # Node.js merkezi backend
├── Frontend/    # Angular dashboard
└── README.md


	MİMARİ

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


Linux Agent, çalıştığı sunucunun sistem metriklerini toplar ve Socket.IO üzerinden merkezi backend'e gönderir.

Backend gelen verileri sunucu kimliğine göre ayırır ve PostgreSQL'de saklar.
Angular dashboard üzerinden kayıtlı sunucular arasında geçiş yapılarak metrikler izlenebilir.


	TOPLANAN METRİKLER

* CPU kullanımı
* RAM kullanımı
* Disk okuma/yazma hızı
* Network alma/gönderme hızı
* Network kullanım yüzdesi

Ayrıca hostname, işletim sistemi, CPU çekirdek sayıları, toplam RAM ve network interface bilgileri tutulur.


	LINUX TEST ORTAMI

Linux tarafı gerçek bir Ubuntu Server kurulumu üzerinde test edilmiştir.

Test ortamı:

* VMware Workstation
* Ubuntu Server VM
* Node.js monitoring agent
* SSH üzerinden yönetim
* Linux network interface: ens33

Linux'taki metrik kaynakları ayrıca işletim sistemi seviyesinde incelenmiştir:

* CPU: /proc/stat
* RAM: /proc/meminfo
* Disk I/O: /proc/diskstats
* Network: /proc/net/dev
* Network interface bilgileri: /sys

Agent tarafında cross-platform metrik toplamak için "systeminformation" NPM paketi kullanılmaktadır.


	ÇOKLU SUNUCU DESTEĞİ

Her sunucu PostgreSQL'de ayrı bir "serverId" ile tutulur.

Bu sayede Windows host ve Linux agent tarafından gönderilen metrikler birbirine karışmadan saklanır ve dashboard üzerinden ayrı ayrı görüntülenebilir.


	AGENT AUTHENTICATION

Linux agent merkezi backend'e bağlanırken kimlik doğrulaması yapar.

Agent bağlantısında:

* Kalıcı bir agent kimliği
* Agent secret
* Server kimliği

kullanılır.

Agent secret doğrudan veritabanında tutulmaz. SHA-256 hash değeri saklanır ve bağlantı sırasında doğrulama yapılır.

Yanlış secret ile bağlantının backend tarafından reddedildiği test edilmiştir.

".env", ".agent-id" ve "node_modules" Git reposuna dahil edilmez.


	HEARTBEAT

Agent, backend'e periyodik heartbeat gönderir.

Heartbeat bilgisine göre sunucular:

* Online
* Offline

olarak işaretlenir.

Böylece metrik gönderimi durmuş olsa bile agent'ın bağlantı durumu ayrı olarak takip edilebilir.
