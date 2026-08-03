# MongoDB DNS Troubleshooting Report

## Current symptom

The backend and seed command fail to resolve the MongoDB Atlas SRV record:

```text
querySrv ECONNREFUSED _mongodb._tcp.cluster0.7pxhir8.mongodb.net
```

The failure occurs during DNS SRV lookup, before MongoDB authentication or database access.

## Environment

- Backend: `online-store-backend`
- MongoDB driver: Mongoose from the backend dependencies
- Atlas cluster hostname: `cluster0.7pxhir8.mongodb.net`
- Wi-Fi adapter: `Realtek 8822CE Wireless LAN 802.11ac PCI-E NIC`
- Network: `Minh Thanh 5G`

No credentials or connection-string secrets are recorded here.

## Steps completed

### 1. Checked the active network adapter

```powershell
Get-NetAdapter | Where-Object {$_.Status -eq "Up"} | Format-Table -AutoSize Name, InterfaceDescription, Status
```

Result: the active adapter is named `Wi-Fi`.

### 2. Set IPv4 DNS servers

```powershell
Set-DnsClientServerAddress -InterfaceAlias "Wi-Fi" -ServerAddresses ("1.1.1.1","8.8.8.8")
```

The command completed without an error.

### 3. Cleared the Windows DNS cache

```powershell
ipconfig /flushdns
```

Result:

```text
Successfully flushed the DNS Resolver Cache.
```

### 4. Tested the default Windows resolver

```powershell
nslookup -type=SRV _mongodb._tcp.cluster0.7pxhir8.mongodb.net
```

Initial result: no response from the configured IPv6 Google DNS server (`2001:4860:4860::8888`).

### 5. Tested Cloudflare DNS directly

```powershell
nslookup -type=SRV _mongodb._tcp.cluster0.7pxhir8.mongodb.net 1.1.1.1
```

Result: successful response with all three Atlas SRV targets:

- `ac-24ykmxh-shard-00-00.7pxhir8.mongodb.net:27017`
- `ac-24ykmxh-shard-00-01.7pxhir8.mongodb.net:27017`
- `ac-24ykmxh-shard-00-02.7pxhir8.mongodb.net:27017`

This confirmed that Atlas is reachable through Cloudflare DNS and that the hostname is valid.

### 6. Configured IPv4 and IPv6 Cloudflare DNS

```powershell
Set-DnsClientServerAddress -InterfaceAlias "Wi-Fi" -ServerAddresses ("1.1.1.1","1.0.0.1","2606:4700:4700::1111","2606:4700:4700::1001")
```

The IPv6 resolver still returned no response.

### 7. Temporarily disabled IPv6 on the Wi-Fi adapter

```powershell
Disable-NetAdapterBinding -Name "Wi-Fi" -ComponentID ms_tcpip6
```

After clearing the cache, the normal `nslookup` command succeeded through `1.1.1.1` and returned all three Atlas SRV targets.

### 8. Tested Node.js DNS resolution directly

Without overriding DNS, Node.js failed:

```powershell
node -e "require('dns').promises.resolveSrv('_mongodb._tcp.cluster0.7pxhir8.mongodb.net').then(console.log).catch(err => console.error(err))"
```

Result: `querySrv ECONNREFUSED`.

With Cloudflare DNS explicitly configured inside Node.js, the same lookup succeeded:

```powershell
node -e "const dns=require('dns'); dns.setServers(['1.1.1.1','1.0.0.1']); dns.promises.resolveSrv('_mongodb._tcp.cluster0.7pxhir8.mongodb.net').then(console.log).catch(console.error)"
```

Result: all three Atlas SRV targets were returned.

### 9. Tested Mongoose with the project `.env`

A direct Mongoose connection using dotenv, Cloudflare DNS, and the same connection options as the application succeeded:

```powershell
node -e "require('dotenv').config(); const dns=require('dns'); dns.setServers(['1.1.1.1','1.0.0.1']); const mongoose=require('mongoose'); mongoose.connect(process.env.MONGO_URI,{maxPoolSize:10,minPoolSize:5,serverSelectionTimeoutMS:8000,socketTimeoutMS:45000,connectTimeoutMS:8000,retryWrites:true,w:'majority',family:4}).then(()=>{console.log('CONNECTED');return mongoose.disconnect()}).catch(err=>{console.error(err.message);process.exitCode=1})"
```

Result:

```text
CONNECTED
```

This confirms that the `.env` connection string, MongoDB credentials, Atlas IP access, DNS override, and Mongoose options can work together in a minimal process.

### 10. Ran the application and seed command

`npm start` continued to report `querySrv ECONNREFUSED`.

`npm run seed` also failed with the same SRV error:

```text
Seeding failed with error: querySrv ECONNREFUSED _mongodb._tcp.cluster0.7pxhir8.mongodb.net
```

The seed entry point currently imports Mongoose at `src/seeds/index.js:7` and does not configure a DNS resolver before that import.

## Code change made during investigation

The following lines were added near the beginning of `src/app.js`, before the Mongoose import:

```js
const dns = require('dns');
dns.setServers(['1.1.1.1', '1.0.0.1']);
```

This change has not yet resolved the application or seed command failure. No further code changes were made after the requested pause.

## Current conclusion

1. MongoDB Atlas itself is responding correctly.
2. The Atlas IP access list is not the current cause.
3. Windows `nslookup` works when Cloudflare IPv4 DNS is used.
4. Node.js SRV lookup fails with the default resolver but succeeds when DNS is explicitly set in a minimal process.
5. Direct Mongoose testing succeeds with the project environment and connection options.
6. The remaining issue is specific to the application/seed process initialization or the resolver used by the MongoDB driver in those entry points.
7. `src/seeds/index.js` definitely needs to be considered separately because it imports Mongoose without the DNS setup used in the direct test.

## Follow-up findings from application logs

The application was started with:

```powershell
npm start
```

The initial MongoDB connection completed far enough for the application to seed translations, brands, currencies, and languages. The exchange-rate scheduler and Cloudinary cleanup worker also started.

After startup, MongoDB operations began failing while resolving individual Atlas replica-set members:

```text
[CLOUDINARY_CLEANUP_OUTBOX] Error: write ECONNRESET
MongoServerSelectionError: getaddrinfo ENOTFOUND ac-24ykmxh-shard-00-00.7pxhir8.mongodb.net
```

The same failure appeared in the exchange-rate scheduler:

```text
[ExchangeRateScheduler] Lỗi cập nhật VND->USD: MongoServerSelectionError: getaddrinfo ENOTFOUND ac-24ykmxh-shard-00-00.7pxhir8.mongodb.net
```

The driver then reported the topology as:

```text
ReplicaSetNoPrimary
```

This does not indicate that Atlas has no primary. It means the driver could not resolve or connect to the replica-set members well enough to select one.

### Important limitation of the current DNS workaround

`src/app.js` currently contains:

```js
const dns = require('dns');
dns.setServers(['1.1.1.1', '1.0.0.1']);
```

This can affect Node.js resolver methods such as `dns.promises.resolveSrv()`, but it does not replace the Windows system resolver used by `dns.lookup()`/`getaddrinfo`. The MongoDB driver may use the latter when resolving the individual shard hostnames returned by the SRV lookup.

Therefore, the current workaround can allow the SRV record to resolve while the subsequent shard hostname lookups still fail with `getaddrinfo ENOTFOUND`.

The seed process has a separate initialization gap. `src/seeds/index.js` imports Mongoose immediately after loading dotenv and does not configure any resolver before connecting. Its failure remains:

```text
Seeding failed with error: querySrv ECONNREFUSED _mongodb._tcp.cluster0.7pxhir8.mongodb.net
```

The `ECONNRESET` from the Cloudinary cleanup worker is a separate transient connection-reset error. It is not an authentication error from Cloudinary; the later `ENOTFOUND` error shows that MongoDB hostname resolution is also failing in that worker.

### Current interpretation

The issue is broader than only the initial MongoDB SRV lookup. The current network/DNS path can fail at both stages:

1. Resolving `_mongodb._tcp.cluster0.7pxhir8.mongodb.net` for the SRV record.
2. Resolving the individual Atlas shard hostnames returned by that SRV record.

## Test result after returning to Ho Chi Minh City

A dynamic PowerShell command was run from the backend directory. It selected the active adapter automatically:

```text
Adapter đang dùng: Wi-Fi (Index: 8)
DNS cũ: 1.1.1.1, 1.0.0.1
```

The command temporarily configured Cloudflare IPv4 DNS, flushed the Windows DNS cache, and tested the MongoDB SRV record through `1.1.1.1`. The SRV lookup succeeded and returned all three Atlas targets:

```text
ac-24ykmxh-shard-00-00.7pxhir8.mongodb.net:27017
ac-24ykmxh-shard-00-01.7pxhir8.mongodb.net:27017
ac-24ykmxh-shard-00-02.7pxhir8.mongodb.net:27017
```

`npm run seed` then connected to MongoDB and successfully completed these modules before the captured output ended:

- System Languages
- Static Translations
- Banner Slot Labels i18n
- Testimonial Labels i18n
- Currencies and Exchange Rates
- Users
- Categories
- Suppliers
- Products, including translations to nine languages
- Homepage Banners
- Customers
- Shipping Providers
- Locations progressed through provinces and districts, then began fetching wards from the GHN API

This confirms that, in the Ho Chi Minh City network environment with Cloudflare DNS configured, the previous `querySrv ECONNREFUSED` error did not occur and the seed process was able to use MongoDB successfully. The captured output does not include the final seed completion message, so full seed completion was not confirmed from this run.

The DNS restoration step ran after `npm run seed` exited. Since the saved DNS was already `1.1.1.1, 1.0.0.1`, the effective DNS configuration remained unchanged.

No application code or seed entry point was changed during this test.

## Not yet done

- No fallback non-SRV MongoDB URI has been generated.
- No changes have been made to the seed entry point.
- No changes have been made to retry logic.
- No direct tests have been run for the individual Atlas shard hostnames.
- Full completion of this particular seed run has not been confirmed from the captured output.
- No credentials or `.env` values have been exposed.
